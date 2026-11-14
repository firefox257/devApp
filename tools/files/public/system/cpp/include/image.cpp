// Speed-optimized image loader: baseline JPEG, 8-bit PNG (incl. interlaced), GIF (first frame).
// Public API: class Image only. Build: g++ -O3 -march=native -fno-exceptions -fno-rtti -flto
//             (emscripten: -O3 -msimd128 -flto)
// Define IMG_ERROR_STRINGS to get real messages from Image::getFailureReason().


#ifndef IMAGE_CPP
#define IMAGE_CPP

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

typedef uint8_t u8; typedef uint16_t u16; typedef uint32_t u32;

#ifdef IMG_ERROR_STRINGS
static const char *g_err;
static int e(const char *s) { g_err = s; return 0; }
#else
#define e(s) 0
#endif
#define epuc(x) (e(x), (u8 *)0)

typedef struct { u32 img_x, img_y; int img_n, img_out_n; int dpi_x, dpi_y; u8 *p, *end; } stbi;

static inline int get8(stbi *s) { return s->p < s->end ? *s->p++ : 0; }
static inline int at_eof(stbi *s) { return s->p >= s->end; }
static inline u8 get8u(stbi *s) { return (u8)get8(s); }
static void skip(stbi *s, u32 n) { size_t r = s->end - s->p; s->p += n > r ? r : n; }
static int getn(stbi *s, u8 *b, u32 n) {
   if ((size_t)(s->end - s->p) < n) return 0;
   memcpy(b, s->p, n); s->p += n; return 1;
}
static int get16(stbi *s) { int z = get8(s); return (z << 8) + get8(s); }
static u32 get32(stbi *s) { u32 z = get16(s); return (z << 16) + get16(s); }
static int get16le(stbi *s) { int z = get8(s); return z + (get8(s) << 8); }

static u8 compute_y(int r, int g, int b) { return (u8)(((r * 77) + (g * 150) + (29 * b)) >> 8); }

static u8 *convert_format(u8 *data, int img_n, int req_comp, u32 x, u32 y) {
   int i, j;
   u8 *good;
   if (req_comp == img_n) return data;
   good = (u8 *)malloc(req_comp * x * y);
   if (!good) { free(data); return epuc("outofmem"); }
   for (j = 0; j < (int)y; ++j) {
      u8 *src = data + j * x * img_n, *dest = good + j * x * req_comp;
      #define COMBO(a,b) ((a)*8+(b))
      #define CASE(a,b)  case COMBO(a,b): for (i = x-1; i >= 0; --i, src += a, dest += b)
      switch (COMBO(img_n, req_comp)) {
         CASE(1,2) dest[0]=src[0], dest[1]=255; break;
         CASE(1,3) dest[0]=dest[1]=dest[2]=src[0]; break;
         CASE(1,4) dest[0]=dest[1]=dest[2]=src[0], dest[3]=255; break;
         CASE(2,1) dest[0]=src[0]; break;
         CASE(2,3) dest[0]=dest[1]=dest[2]=src[0]; break;
         CASE(2,4) dest[0]=dest[1]=dest[2]=src[0], dest[3]=src[1]; break;
         CASE(3,4) dest[0]=src[0],dest[1]=src[1],dest[2]=src[2],dest[3]=255; break;
         CASE(3,1) dest[0]=compute_y(src[0],src[1],src[2]); break;
         CASE(3,2) dest[0]=compute_y(src[0],src[1],src[2]), dest[1]=255; break;
         CASE(4,1) dest[0]=compute_y(src[0],src[1],src[2]); break;
         CASE(4,2) dest[0]=compute_y(src[0],src[1],src[2]), dest[1]=src[3]; break;
         CASE(4,3) dest[0]=src[0],dest[1]=src[1],dest[2]=src[2]; break;
      }
      #undef CASE
   }
   free(data);
   return good;
}

// ============================ JPEG ============================
#define FAST_BITS 9

typedef struct {
   u8 fast[1 << FAST_BITS];
   u16 code[256];
   u8 values[256];
   u8 size[257];
   u32 maxcode[18];
   int delta[17];
} huffman;

typedef struct {
   stbi *s;
   huffman huff_dc[4], huff_ac[4];
   u8 dequant[4][64];
   int img_h_max, img_v_max, img_mcu_x, img_mcu_y, img_mcu_w, img_mcu_h;
   struct {
      int id, h, v, tq, hd, ha, dc_pred, x, y, w2, h2;
      u8 *data; void *raw_data; u8 *linebuf;
   } img_comp[4];
   u32 code_buffer;
   int code_bits;
   unsigned char marker;
   int nomore, scan_n, order[4], restart_interval, todo;
   int dconly;                                        // set by decode_block: block had no AC coefficients
} jpeg;

static int build_huffman(huffman *h, int *count) {
   int i, j, k = 0, code;
   for (i = 0; i < 16; ++i)
      for (j = 0; j < count[i]; ++j) h->size[k++] = (u8)(i + 1);
   h->size[k] = 0;
   code = 0; k = 0;
   for (j = 1; j <= 16; ++j) {
      h->delta[j] = k - code;
      if (h->size[k] == j) {
         while (h->size[k] == j) h->code[k++] = (u16)(code++);
         if (code - 1 >= (1 << j)) return e("bad code lengths");
      }
      h->maxcode[j] = code << (16 - j);
      code <<= 1;
   }
   h->maxcode[j] = 0xffffffff;
   memset(h->fast, 255, 1 << FAST_BITS);
   for (i = 0; i < k; ++i) {
      int s = h->size[i];
      if (s <= FAST_BITS) {
         int c = h->code[i] << (FAST_BITS - s), m = 1 << (FAST_BITS - s);
         for (j = 0; j < m; ++j) h->fast[c + j] = (u8)i;
      }
   }
   return 1;
}

static void grow_buffer_unsafe(jpeg *j) {
   do {
      int b = j->nomore ? 0 : get8(j->s);
      if (b == 0xff) {
         int c = get8(j->s);
         if (c != 0) { j->marker = (unsigned char)c; j->nomore = 1; return; }
      }
      j->code_buffer |= b << (24 - j->code_bits);
      j->code_bits += 8;
   } while (j->code_bits <= 24);
}

static const u32 bmask[17] = {0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535};

static int decode(jpeg *j, huffman *h) {
   unsigned int temp;
   int c, k;
   if (j->code_bits < 16) grow_buffer_unsafe(j);
   c = (j->code_buffer >> (32 - FAST_BITS)) & ((1 << FAST_BITS) - 1);
   k = h->fast[c];
   if (k < 255) {
      int s = h->size[k];
      if (s > j->code_bits) return -1;
      j->code_buffer <<= s; j->code_bits -= s;
      return h->values[k];
   }
   temp = j->code_buffer >> 16;
   for (k = FAST_BITS + 1; ; ++k) if (temp < h->maxcode[k]) break;
   if (k == 17) { j->code_bits -= 16; return -1; }
   if (k > j->code_bits) return -1;
   c = ((j->code_buffer >> (32 - k)) & bmask[k]) + h->delta[k];
   j->code_bits -= k; j->code_buffer <<= k;
   return h->values[c];
}

static int extend_receive(jpeg *j, int n) {
   unsigned int m = 1 << (n - 1), k;
   if (j->code_bits < n) grow_buffer_unsafe(j);
   k = (j->code_buffer >> (32 - n)) & bmask[n];
   j->code_bits -= n; j->code_buffer <<= n;
   return k < m ? (-1 << n) + k + 1 : k;
}

static const u8 dezigzag[64 + 16] = {
    0,  1,  8, 16,  9,  2,  3, 10, 17, 24, 32, 25, 18, 11,  4,  5,
   12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13,  6,  7, 14, 21, 28,
   35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
   58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
   63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63
};

static int decode_block(jpeg *j, short data[64], huffman *hdc, huffman *hac, int b) {
   int diff, dc, k, t = decode(j, hdc);
   if (t < 0) return e("bad huffman code");
   memset(data, 0, 64 * sizeof(data[0]));
   j->dconly = 1;
   diff = t ? extend_receive(j, t) : 0;
   dc = j->img_comp[b].dc_pred + diff;
   j->img_comp[b].dc_pred = dc;
   data[0] = (short)dc;
   k = 1;
   do {
      int rs = decode(j, hac), r, s;
      if (rs < 0) return e("bad huffman code");
      s = rs & 15; r = rs >> 4;
      if (s == 0) {
         if (rs != 0xf0) break;
         k += 16;
      } else {
         k += r;
         data[dezigzag[k++]] = (short)extend_receive(j, s);
         j->dconly = 0;
      }
   } while (k < 64);
   return 1;
}

static u8 clamp(int x) { return x < 0 ? 0 : x > 255 ? 255 : (u8)x; }

#define f2f(x) (int)(((x) * 4096 + 0.5))
#define fsh(x) ((x) << 12)

#define IDCT_1D(s0,s1,s2,s3,s4,s5,s6,s7)       \
   int t0,t1,t2,t3,p1,p2,p3,p4,p5,x0,x1,x2,x3; \
   p2 = s2; p3 = s6;                           \
   p1 = (p2+p3) * f2f(0.5411961f);             \
   t2 = p1 + p3*f2f(-1.847759065f);            \
   t3 = p1 + p2*f2f( 0.765366865f);            \
   p2 = s0; p3 = s4;                           \
   t0 = fsh(p2+p3); t1 = fsh(p2-p3);           \
   x0 = t0+t3; x3 = t0-t3;                     \
   x1 = t1+t2; x2 = t1-t2;                     \
   t0 = s7; t1 = s5; t2 = s3; t3 = s1;         \
   p3 = t0+t2; p4 = t1+t3;                     \
   p1 = t0+t3; p2 = t1+t2;                     \
   p5 = (p3+p4)*f2f( 1.175875602f);            \
   t0 = t0*f2f( 0.298631336f);                 \
   t1 = t1*f2f( 2.053119869f);                 \
   t2 = t2*f2f( 3.072711026f);                 \
   t3 = t3*f2f( 1.501321110f);                 \
   p1 = p5 + p1*f2f(-0.899976223f);            \
   p2 = p5 + p2*f2f(-2.562915447f);            \
   p3 = p3*f2f(-1.961570560f);                 \
   p4 = p4*f2f(-0.390180644f);                 \
   t3 += p1+p4; t2 += p2+p3;                   \
   t1 += p2+p4; t0 += p1+p3;

static void idct_block(u8 *out, int out_stride, short data[64], u8 *dequantize) {
   int i, val[64], *v = val;
   u8 *dq = dequantize, *o;
   short *d = data;
   for (i = 0; i < 8; ++i, ++d, ++dq, ++v) {
      if (d[8]==0 && d[16]==0 && d[24]==0 && d[32]==0 && d[40]==0 && d[48]==0 && d[56]==0) {
         int dcterm = d[0] * dq[0] << 2;
         v[0]=v[8]=v[16]=v[24]=v[32]=v[40]=v[48]=v[56]=dcterm;
      } else {
         IDCT_1D(d[0]*dq[0],d[8]*dq[8],d[16]*dq[16],d[24]*dq[24],
                 d[32]*dq[32],d[40]*dq[40],d[48]*dq[48],d[56]*dq[56])
         x0 += 512; x1 += 512; x2 += 512; x3 += 512;
         v[0]  = (x0+t3) >> 10; v[56] = (x0-t3) >> 10;
         v[8]  = (x1+t2) >> 10; v[48] = (x1-t2) >> 10;
         v[16] = (x2+t1) >> 10; v[40] = (x2-t1) >> 10;
         v[24] = (x3+t0) >> 10; v[32] = (x3-t0) >> 10;
      }
   }
   for (i = 0, v = val, o = out; i < 8; ++i, v += 8, o += out_stride) {
      IDCT_1D(v[0],v[1],v[2],v[3],v[4],v[5],v[6],v[7])
      x0 += 65536 + (128<<17); x1 += 65536 + (128<<17);
      x2 += 65536 + (128<<17); x3 += 65536 + (128<<17);
      o[0] = clamp((x0+t3) >> 17); o[7] = clamp((x0-t3) >> 17);
      o[1] = clamp((x1+t2) >> 17); o[6] = clamp((x1-t2) >> 17);
      o[2] = clamp((x2+t1) >> 17); o[5] = clamp((x2-t1) >> 17);
      o[3] = clamp((x3+t0) >> 17); o[4] = clamp((x3-t0) >> 17);
   }
}

// DC-only block: every output pixel is identical (same math as the full IDCT).
static void idct_dc(u8 *out, int out_stride, short dc, u8 dq) {
   int v = ((dc * dq << 2) * 4096 + 65536 + (128 << 17)) >> 17;
   u8 c = clamp(v);
   for (int i = 0; i < 8; ++i, out += out_stride) memset(out, c, 8);
}

#define MARKER_none 0xff

static u8 get_marker(jpeg *j) {
   u8 x;
   if (j->marker != MARKER_none) { x = j->marker; j->marker = MARKER_none; return x; }
   x = get8u(j->s);
   if (x != 0xff) return MARKER_none;
   while (x == 0xff) x = get8u(j->s);
   return x;
}

#define RESTART(x) ((x) >= 0xd0 && (x) <= 0xd7)

static void reset(jpeg *j) {
   j->code_bits = 0; j->code_buffer = 0; j->nomore = 0;
   j->img_comp[0].dc_pred = j->img_comp[1].dc_pred = j->img_comp[2].dc_pred = 0;
   j->marker = MARKER_none;
   j->todo = j->restart_interval ? j->restart_interval : 0x7fffffff;
}

// returns 1 = keep going, 2 = stop scan (ok), 0 = error
static int restart_check(jpeg *z) {
   if (--z->todo <= 0) {
      if (z->code_bits < 24) grow_buffer_unsafe(z);
      if (!RESTART(z->marker)) return 2;
      reset(z);
   }
   return 1;
}

static int parse_entropy_coded_data(jpeg *z) {
   short data[64];
   int i, j, k, x, y;
   reset(z);
   if (z->scan_n == 1) {
      int n = z->order[0];
      int w = (z->img_comp[n].x + 7) >> 3, h = (z->img_comp[n].y + 7) >> 3;
      for (j = 0; j < h; ++j)
         for (i = 0; i < w; ++i) {
            u8 *dst = z->img_comp[n].data + z->img_comp[n].w2 * j * 8 + i * 8;
            u8 *dq = z->dequant[z->img_comp[n].tq];
            if (!decode_block(z, data, z->huff_dc + z->img_comp[n].hd, z->huff_ac + z->img_comp[n].ha, n)) return 0;
            if (z->dconly) idct_dc(dst, z->img_comp[n].w2, data[0], dq[0]);
            else           idct_block(dst, z->img_comp[n].w2, data, dq);
            if (restart_check(z) == 2) return 1;
         }
   } else {
      for (j = 0; j < z->img_mcu_y; ++j)
         for (i = 0; i < z->img_mcu_x; ++i) {
            for (k = 0; k < z->scan_n; ++k) {
               int n = z->order[k];
               for (y = 0; y < z->img_comp[n].v; ++y)
                  for (x = 0; x < z->img_comp[n].h; ++x) {
                     int x2 = (i * z->img_comp[n].h + x) * 8, y2 = (j * z->img_comp[n].v + y) * 8;
                     u8 *dst = z->img_comp[n].data + z->img_comp[n].w2 * y2 + x2;
                     u8 *dq = z->dequant[z->img_comp[n].tq];
                     if (!decode_block(z, data, z->huff_dc + z->img_comp[n].hd, z->huff_ac + z->img_comp[n].ha, n)) return 0;
                     if (z->dconly) idct_dc(dst, z->img_comp[n].w2, data[0], dq[0]);
                     else           idct_block(dst, z->img_comp[n].w2, data, dq);
                  }
            }
            if (restart_check(z) == 2) return 1;
         }
   }
   return 1;
}

static int process_marker(jpeg *z, int m) {
   int L;
   switch (m) {
      case MARKER_none: return e("expected marker");
      case 0xC2: return e("progressive jpeg");
      case 0xDD:
         if (get16(z->s) != 4) return e("bad DRI len");
         z->restart_interval = get16(z->s);
         return 1;
      case 0xDB:
         L = get16(z->s) - 2;
         while (L > 0) {
            int q = get8(z->s), p = q >> 4, t = q & 15, i;
            if (p != 0) return e("bad DQT type");
            if (t > 3) return e("bad DQT table");
            for (i = 0; i < 64; ++i) z->dequant[t][dezigzag[i]] = get8u(z->s);
            L -= 65;
         }
         return L == 0;
      case 0xC4:
         L = get16(z->s) - 2;
         while (L > 0) {
            u8 *v;
            int sizes[16], i, n = 0;
            int q = get8(z->s), tc = q >> 4, th = q & 15;
            if (tc > 1 || th > 3) return e("bad DHT header");
            for (i = 0; i < 16; ++i) { sizes[i] = get8(z->s); n += sizes[i]; }
            L -= 17;
            if (tc == 0) { if (!build_huffman(z->huff_dc + th, sizes)) return 0; v = z->huff_dc[th].values; }
            else         { if (!build_huffman(z->huff_ac + th, sizes)) return 0; v = z->huff_ac[th].values; }
            for (i = 0; i < n; ++i) v[i] = get8u(z->s);
            L -= n;
         }
         return L == 0;
      case 0xE0: // JFIF APP0
      {
         L = get16(z->s);
         u8 *start_p = z->s->p;
         if (L >= 16) {
            u8 id[5];
            if (getn(z->s, id, 5)) {
               if (id[0]=='J' && id[1]=='F' && id[2]=='I' && id[3]=='F' && id[4]==0) {
                  get16(z->s); // version
                  u8 unit = get8(z->s);
                  u16 x_density = get16(z->s);
                  u16 y_density = get16(z->s);
                  if (unit == 1) {
                     z->s->dpi_x = x_density;
                     z->s->dpi_y = y_density;
                  } else if (unit == 2) {
                     z->s->dpi_x = (int)(x_density * 2.54 + 0.5);
                     z->s->dpi_y = (int)(y_density * 2.54 + 0.5);
                  }
               }
            }
         }
         z->s->p = start_p + L - 2;
         if (z->s->p > z->s->end) z->s->p = z->s->end;
         return 1;
      }
   }
   if ((m >= 0xE1 && m <= 0xEF) || m == 0xFE) { skip(z->s, get16(z->s) - 2); return 1; }
   return 0;
}

static int process_scan_header(jpeg *z) {
   int i, Ls = get16(z->s);
   z->scan_n = get8(z->s);
   if (z->scan_n < 1 || z->scan_n > 4 || z->scan_n > (int)z->s->img_n) return e("bad SOS component count");
   if (Ls != 6 + 2 * z->scan_n) return e("bad SOS len");
   for (i = 0; i < z->scan_n; ++i) {
      int id = get8(z->s), which, q = get8(z->s);
      for (which = 0; which < z->s->img_n; ++which)
         if (z->img_comp[which].id == id) break;
      if (which == z->s->img_n) return 0;
      z->img_comp[which].hd = q >> 4;   if (z->img_comp[which].hd > 3) return e("bad DC huff");
      z->img_comp[which].ha = q & 15;   if (z->img_comp[which].ha > 3) return e("bad AC huff");
      z->order[i] = which;
   }
   if (get8(z->s) != 0) return e("bad SOS");
   get8(z->s);
   if (get8(z->s) != 0) return e("bad SOS");
   return 1;
}

static int process_frame_header(jpeg *z) {
   stbi *s = z->s;
   int Lf, p, i, q, h_max = 1, v_max = 1, c;
   Lf = get16(s);         if (Lf < 11) return e("bad SOF len");
   p  = get8(s);          if (p != 8) return e("only 8-bit");
   s->img_y = get16(s);   if (s->img_y == 0) return e("no header height");
   s->img_x = get16(s);   if (s->img_x == 0) return e("0 width");
   c = get8(s);
   if (c != 3 && c != 1) return e("bad component count");
   s->img_n = c;
   for (i = 0; i < c; ++i) { z->img_comp[i].data = NULL; z->img_comp[i].linebuf = NULL; }
   if (Lf != 8 + 3 * s->img_n) return e("bad SOF len");
   for (i = 0; i < s->img_n; ++i) {
      z->img_comp[i].id = get8(s);
      if (z->img_comp[i].id != i + 1 && z->img_comp[i].id != i) return e("bad component ID");
      q = get8(s);
      z->img_comp[i].h = q >> 4;   if (!z->img_comp[i].h || z->img_comp[i].h > 4) return e("bad H");
      z->img_comp[i].v = q & 15;   if (!z->img_comp[i].v || z->img_comp[i].v > 4) return e("bad V");
      z->img_comp[i].tq = get8(s); if (z->img_comp[i].tq > 3) return e("bad TQ");
   }
   if ((1 << 30) / s->img_x / s->img_n < s->img_y) return e("too large");
   for (i = 0; i < s->img_n; ++i) {
      if (z->img_comp[i].h > h_max) h_max = z->img_comp[i].h;
      if (z->img_comp[i].v > v_max) v_max = z->img_comp[i].v;
   }
   z->img_h_max = h_max; z->img_v_max = v_max;
   z->img_mcu_w = h_max * 8; z->img_mcu_h = v_max * 8;
   z->img_mcu_x = (s->img_x + z->img_mcu_w - 1) / z->img_mcu_w;
   z->img_mcu_y = (s->img_y + z->img_mcu_h - 1) / z->img_mcu_h;
   for (i = 0; i < s->img_n; ++i) {
      z->img_comp[i].x = (s->img_x * z->img_comp[i].h + h_max - 1) / h_max;
      z->img_comp[i].y = (s->img_y * z->img_comp[i].v + v_max - 1) / v_max;
      z->img_comp[i].w2 = z->img_mcu_x * z->img_comp[i].h * 8;
      z->img_comp[i].h2 = z->img_mcu_y * z->img_comp[i].v * 8;
      z->img_comp[i].raw_data = malloc(z->img_comp[i].w2 * z->img_comp[i].h2 + 15);
      if (!z->img_comp[i].raw_data) {
         for (--i; i >= 0; --i) { free(z->img_comp[i].raw_data); z->img_comp[i].data = NULL; }
         return e("outofmem");
      }
      z->img_comp[i].data = (u8 *)(((size_t)z->img_comp[i].raw_data + 15) & ~(size_t)15);
      z->img_comp[i].linebuf = NULL;
   }
   return 1;
}

static int decode_jpeg_image(jpeg *j) {
   int m;
   j->restart_interval = 0;
   j->marker = MARKER_none;
   m = get_marker(j);
   if (m != 0xd8) return e("no SOI");
   m = get_marker(j);
   while (m != 0xc0 && m != 0xc1) {                  // until SOF
      if (!process_marker(j, m)) return 0;
      m = get_marker(j);
      while (m == MARKER_none) {
         if (at_eof(j->s)) return e("no SOF");
         m = get_marker(j);
      }
   }
   if (!process_frame_header(j)) return 0;
   m = get_marker(j);
   while (m != 0xd9) {                               // until EOI
      if (m == 0xda) {                               // SOS
         if (!process_scan_header(j) || !parse_entropy_coded_data(j)) return 0;
         if (j->marker == MARKER_none) {
            while (!at_eof(j->s)) {
               int x = get8(j->s);
               if (x == 255) { j->marker = get8u(j->s); break; }
               else if (x != 0) return 0;
            }
         }
      } else if (!process_marker(j, m)) return 0;
      m = get_marker(j);
   }
   return 1;
}

typedef u8 *(*resample_row_func)(u8 *out, u8 *in0, u8 *in1, int w, int hs);
#define div4(x)  ((u8)((x) >> 2))
#define div16(x) ((u8)((x) >> 4))

static u8 *resample_row_1(u8 *out, u8 *in_near, u8 *in_far, int w, int hs) { return in_near; }

static u8 *resample_row_v_2(u8 *out, u8 *in_near, u8 *in_far, int w, int hs) {
   for (int i = 0; i < w; ++i) out[i] = div4(3 * in_near[i] + in_far[i] + 2);
   return out;
}

static u8 *resample_row_h_2(u8 *out, u8 *in, u8 *in_far, int w, int hs) {
   int i;
   if (w == 1) { out[0] = out[1] = in[0]; return out; }
   out[0] = in[0];
   out[1] = div4(in[0] * 3 + in[1] + 2);
   for (i = 1; i < w - 1; ++i) {
      int n = 3 * in[i] + 2;
      out[i*2+0] = div4(n + in[i-1]);
      out[i*2+1] = div4(n + in[i+1]);
   }
   out[i*2+0] = div4(in[w-2] * 3 + in[w-1] + 2);
   out[i*2+1] = in[w-1];
   return out;
}

static u8 *resample_row_hv_2(u8 *out, u8 *in_near, u8 *in_far, int w, int hs) {
   int i, t0, t1;
   if (w == 1) { out[0] = out[1] = div4(3 * in_near[0] + in_far[0] + 2); return out; }
   t1 = 3 * in_near[0] + in_far[0];
   out[0] = div4(t1 + 2);
   for (i = 1; i < w; ++i) {
      t0 = t1;
      t1 = 3 * in_near[i] + in_far[i];
      out[i*2-1] = div16(3 * t0 + t1 + 8);
      out[i*2  ] = div16(3 * t1 + t0 + 8);
   }
   out[w*2-1] = div4(t1 + 2);
   return out;
}

static u8 *resample_row_generic(u8 *out, u8 *in_near, u8 *in_far, int w, int hs) {
   for (int i = 0; i < w; ++i)
      for (int j = 0; j < hs; ++j) out[i*hs+j] = in_near[i];
   return out;
}

#define float2fixed(x) ((int)((x) * 65536 + 0.5))

static void YCbCr_to_RGB_row(u8 *out, const u8 *y, const u8 *pcb, const u8 *pcr, int count, int step) {
   for (int i = 0; i < count; ++i) {
      int y_fixed = (y[i] << 16) + 32768, cr = pcr[i] - 128, cb = pcb[i] - 128;
      int r = (y_fixed + cr * float2fixed(1.40200f)) >> 16;
      int g = (y_fixed - cr * float2fixed(0.71414f) - cb * float2fixed(0.34414f)) >> 16;
      int b = (y_fixed + cb * float2fixed(1.77200f)) >> 16;
      out[0] = clamp(r); out[1] = clamp(g); out[2] = clamp(b); out[3] = 255;
      out += step;
   }
}

static void cleanup_jpeg(jpeg *j) {
   for (int i = 0; i < j->s->img_n; ++i) {
      if (j->img_comp[i].data) { free(j->img_comp[i].raw_data); j->img_comp[i].data = NULL; }
      free(j->img_comp[i].linebuf); j->img_comp[i].linebuf = NULL;
   }
}

typedef struct {
   resample_row_func resample;
   u8 *line0, *line1;
   int hs, vs, w_lores, ystep, ypos;
} stbi_resample;

static u8 *jpeg_load(stbi *s, int *out_x, int *out_y, int *comp, int req_comp) {
   jpeg z, *j = &z;
   int n, decode_n, k;
   unsigned int i, jj;
   u8 *output, *coutput[4];
   stbi_resample res_comp[4];
   j->s = s;
   if (req_comp < 0 || req_comp > 4) return epuc("bad req_comp");
   s->img_n = 0;
   if (!decode_jpeg_image(j)) { cleanup_jpeg(j); return NULL; }
   n = req_comp ? req_comp : s->img_n;
   decode_n = (s->img_n == 3 && n < 3) ? 1 : s->img_n;
   for (k = 0; k < decode_n; ++k) {
      stbi_resample *r = &res_comp[k];
      j->img_comp[k].linebuf = (u8 *)malloc(s->img_x + 3);
      if (!j->img_comp[k].linebuf) { cleanup_jpeg(j); return epuc("outofmem"); }
      r->hs = j->img_h_max / j->img_comp[k].h;
      r->vs = j->img_v_max / j->img_comp[k].v;
      r->ystep = r->vs >> 1;
      r->w_lores = (s->img_x + r->hs - 1) / r->hs;
      r->ypos = 0;
      r->line0 = r->line1 = j->img_comp[k].data;
      r->resample = (r->hs == 1 && r->vs == 1) ? resample_row_1 :
                    (r->hs == 1 && r->vs == 2) ? resample_row_v_2 :
                    (r->hs == 2 && r->vs == 1) ? resample_row_h_2 :
                    (r->hs == 2 && r->vs == 2) ? resample_row_hv_2 : resample_row_generic;
   }
   output = (u8 *)malloc(n * s->img_x * s->img_y + 1);
   if (!output) { cleanup_jpeg(j); return epuc("outofmem"); }
   for (jj = 0; jj < s->img_y; ++jj) {
      u8 *out = output + n * s->img_x * jj;
      for (k = 0; k < decode_n; ++k) {
         stbi_resample *r = &res_comp[k];
         int y_bot = r->ystep >= (r->vs >> 1);
         coutput[k] = r->resample(j->img_comp[k].linebuf, y_bot ? r->line1 : r->line0,
                                  y_bot ? r->line0 : r->line1, r->w_lores, r->hs);
         if (++r->ystep >= r->vs) {
            r->ystep = 0;
            r->line0 = r->line1;
            if (++r->ypos < j->img_comp[k].y) r->line1 += j->img_comp[k].w2;
         }
      }
      u8 *y = coutput[0];
      if (n >= 3) {
         if (s->img_n == 3) YCbCr_to_RGB_row(out, y, coutput[1], coutput[2], s->img_x, n);
         else for (i = 0; i < s->img_x; ++i) { out[0] = out[1] = out[2] = y[i]; out[3] = 255; out += n; }
      } else if (n == 1) for (i = 0; i < s->img_x; ++i) out[i] = y[i];
      else for (i = 0; i < s->img_x; ++i) *out++ = y[i], *out++ = 255;
   }
   cleanup_jpeg(j);
   *out_x = s->img_x; *out_y = s->img_y; *comp = s->img_n;
   return output;
}

// ============================ zlib ============================
#define ZFAST_BITS 9
#define ZFAST_MASK ((1 << ZFAST_BITS) - 1)

typedef struct {
   u16 fast[1 << ZFAST_BITS], firstcode[16];
   int maxcode[17];
   u16 firstsymbol[16];
   u8 size[288];
   u16 value[288];
} zhuffman;

typedef struct {
   u8 *zbuffer, *zbuffer_end;
   int num_bits;
   u32 code_buffer;
   char *zout, *zout_start, *zout_end;
   zhuffman z_length, z_distance;
} zbuf;

static int bit_reverse(int n, int bits) {
   n = ((n & 0xAAAA) >> 1) | ((n & 0x5555) << 1);
   n = ((n & 0xCCCC) >> 2) | ((n & 0x3333) << 2);
   n = ((n & 0xF0F0) >> 4) | ((n & 0x0F0F) << 4);
   n = ((n & 0xFF00) >> 8) | ((n & 0x00FF) << 8);
   return n >> (16 - bits);
}

static int zbuild_huffman(zhuffman *z, u8 *sizelist, int num) {
   int i, k = 0, code, next_code[16], sizes[17];
   memset(sizes, 0, sizeof(sizes));
   memset(z->fast, 255, sizeof(z->fast));
   for (i = 0; i < num; ++i) ++sizes[sizelist[i]];
   sizes[0] = 0;
   code = 0;
   for (i = 1; i < 16; ++i) {
      next_code[i] = code;
      z->firstcode[i] = (u16)code;
      z->firstsymbol[i] = (u16)k;
      code += sizes[i];
      if (sizes[i] && code - 1 >= (1 << i)) return e("bad codelengths");
      z->maxcode[i] = code << (16 - i);
      code <<= 1;
      k += sizes[i];
   }
   z->maxcode[16] = 0x10000;
   for (i = 0; i < num; ++i) {
      int s = sizelist[i];
      if (s) {
         int c = next_code[s] - z->firstcode[s] + z->firstsymbol[s];
         z->size[c] = (u8)s;
         z->value[c] = (u16)i;
         if (s <= ZFAST_BITS)
            for (int r = bit_reverse(next_code[s], s); r < (1 << ZFAST_BITS); r += 1 << s) z->fast[r] = (u16)c;
         ++next_code[s];
      }
   }
   return 1;
}

static int zget8(zbuf *z) { return z->zbuffer >= z->zbuffer_end ? 0 : *z->zbuffer++; }

static void fill_bits(zbuf *z) {
   do { z->code_buffer |= zget8(z) << z->num_bits; z->num_bits += 8; } while (z->num_bits <= 24);
}

static unsigned int zreceive(zbuf *z, int n) {
   unsigned int k;
   if (z->num_bits < n) fill_bits(z);
   k = z->code_buffer & ((1 << n) - 1);
   z->code_buffer >>= n; z->num_bits -= n;
   return k;
}

static int zhuffman_decode(zbuf *a, zhuffman *z) {
   int b, s, k;
   if (a->num_bits < 16) fill_bits(a);
   b = z->fast[a->code_buffer & ZFAST_MASK];
   if (b < 0xffff) {
      s = z->size[b];
      a->code_buffer >>= s; a->num_bits -= s;
      return z->value[b];
   }
   k = bit_reverse(a->code_buffer, 16);
   for (s = ZFAST_BITS + 1; ; ++s) if (k < z->maxcode[s]) break;
   if (s == 16) return -1;
   b = (k >> (16 - s)) - z->firstcode[s] + z->firstsymbol[s];
   a->code_buffer >>= s; a->num_bits -= s;
   return z->value[b];
}

static int expand(zbuf *z, int n) {
   char *q;
   int cur = (int)(z->zout - z->zout_start), limit = (int)(z->zout_end - z->zout_start);
   while (cur + n > limit) limit *= 2;
   q = (char *)realloc(z->zout_start, limit);
   if (!q) return e("outofmem");
   z->zout_start = q; z->zout = q + cur; z->zout_end = q + limit;
   return 1;
}

static const u16 length_base[31] = {3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0};
static const u8  length_extra[31] = {0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0};
static const u16 dist_base[32] = {1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0};
static const u8  dist_extra[32] = {0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0};

static int parse_huffman_block(zbuf *a) {
   for (;;) {
      int z = zhuffman_decode(a, &a->z_length);
      if (z < 256) {
         if (z < 0) return e("bad huffman code");
         if (a->zout >= a->zout_end && !expand(a, 1)) return 0;
         *a->zout++ = (char)z;
      } else {
         u8 *p;
         int len, dist;
         if (z == 256) return 1;
         z -= 257;
         len = length_base[z];
         if (length_extra[z]) len += zreceive(a, length_extra[z]);
         z = zhuffman_decode(a, &a->z_distance);
         if (z < 0) return e("bad huffman code");
         dist = dist_base[z];
         if (dist_extra[z]) dist += zreceive(a, dist_extra[z]);
         if (a->zout - a->zout_start < dist) return e("bad dist");
         if (a->zout + len > a->zout_end && !expand(a, len)) return 0;
         p = (u8 *)(a->zout - dist);
         if (dist >= len)    { memcpy(a->zout, p, len); a->zout += len; }
         else if (dist == 1) { memset(a->zout, *p, len); a->zout += len; }
         else                { while (len--) *a->zout++ = *p++; }
      }
   }
}

static int compute_huffman_codes(zbuf *a) {
   static const u8 length_dezigzag[19] = {16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15};
   zhuffman z_codelength;
   u8 lencodes[288 + 32 + 138], codelength_sizes[19];
   int i, n;
   int hlit = zreceive(a, 5) + 257, hdist = zreceive(a, 5) + 1, hclen = zreceive(a, 4) + 4;
   memset(codelength_sizes, 0, sizeof(codelength_sizes));
   for (i = 0; i < hclen; ++i) codelength_sizes[length_dezigzag[i]] = (u8)zreceive(a, 3);
   if (!zbuild_huffman(&z_codelength, codelength_sizes, 19)) return 0;
   n = 0;
   while (n < hlit + hdist) {
      int c = zhuffman_decode(a, &z_codelength);
      if (c < 0) return 0;
      if (c < 16) lencodes[n++] = (u8)c;
      else {
         int v = 0;
         if (c == 16) { if (!n) return 0; c = zreceive(a, 2) + 3; v = lencodes[n-1]; }
         else if (c == 17) c = zreceive(a, 3) + 3;
         else c = zreceive(a, 7) + 11;
         memset(lencodes + n, v, c);
         n += c;
      }
   }
   if (n != hlit + hdist) return e("bad codelengths");
   return zbuild_huffman(&a->z_length, lencodes, hlit) && zbuild_huffman(&a->z_distance, lencodes + hlit, hdist);
}

static int parse_uncompressed_block(zbuf *a) {
   u8 header[4];
   int len, nlen, k = 0;
   if (a->num_bits & 7) zreceive(a, a->num_bits & 7);
   while (a->num_bits > 0) { header[k++] = (u8)(a->code_buffer & 255); a->code_buffer >>= 8; a->num_bits -= 8; }
   while (k < 4) header[k++] = (u8)zget8(a);
   len = header[1] * 256 + header[0];
   nlen = header[3] * 256 + header[2];
   if (nlen != (len ^ 0xffff)) return e("zlib corrupt");
   if (a->zbuffer + len > a->zbuffer_end) return e("read past buffer");
   if (a->zout + len > a->zout_end && !expand(a, len)) return 0;
   memcpy(a->zout, a->zbuffer, len);
   a->zbuffer += len; a->zout += len;
   return 1;
}

static u8 default_length[288], default_distance[32];

static int parse_zlib(zbuf *a) {
   int final, type;
   int cmf = zget8(a), flg = zget8(a);
   if ((cmf * 256 + flg) % 31 != 0 || (flg & 32) || (cmf & 15) != 8) return e("bad zlib header");
   a->num_bits = 0; a->code_buffer = 0;
   do {
      final = zreceive(a, 1);
      type = zreceive(a, 2);
      if (type == 0) { if (!parse_uncompressed_block(a)) return 0; }
      else if (type == 3) return 0;
      else {
         if (type == 1) {
            if (!default_distance[31]) {
               int i;
               for (i = 0; i < 288; ++i) default_length[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
               for (i = 0; i < 32; ++i) default_distance[i] = 5;
            }
            if (!zbuild_huffman(&a->z_length, default_length, 288)) return 0;
            if (!zbuild_huffman(&a->z_distance, default_distance, 32)) return 0;
         } else if (!compute_huffman_codes(a)) return 0;
         if (!parse_huffman_block(a)) return 0;
      }
   } while (!final);
   return 1;
}

// hint = expected output size; presizing avoids repeated realloc doubling.
static u8 *zdecode(const u8 *buf, int len, int *outlen, size_t hint) {
   zbuf a;
   size_t cap = hint > 16384 ? hint : 16384;
   if (cap > (size_t)len * 8 + 16384) cap = (size_t)len * 8 + 16384;   // don't trust the header blindly
   char *p = (char *)malloc(cap);
   if (!p) return NULL;
   a.zbuffer = (u8 *)buf; a.zbuffer_end = (u8 *)buf + len;
   a.zout_start = a.zout = p; a.zout_end = p + cap;
   if (parse_zlib(&a)) { *outlen = (int)(a.zout - a.zout_start); return (u8 *)a.zout_start; }
   free(a.zout_start);
   return NULL;
}

// ============================ PNG ============================
#define PNG_TYPE(a,b,c,d) (((a) << 24) + ((b) << 16) + ((c) << 8) + (d))

typedef struct { stbi *s; u8 *idata, *expanded, *out; } png;

enum { F_none = 0, F_sub, F_up, F_avg, F_paeth, F_avg_first, F_paeth_first };
static const u8 first_row_filter[5] = { F_none, F_sub, F_none, F_avg_first, F_paeth_first };

static inline int paeth(int a, int b, int c) {
   int p = a + b - c, pa = abs(p - a), pb = abs(p - b), pc = abs(p - c);
   if (pa <= pb && pa <= pc) return a;
   return pb <= pc ? b : c;
}

static int create_png_image_raw(png *a, u8 *raw, u32 raw_len, int out_n, u32 x, u32 y) {
   stbi *s = a->s;
   u32 i, j, stride = x * out_n;
   int k, img_n = s->img_n;
   a->out = (u8 *)malloc(x * y * out_n);
   if (!a->out) return e("outofmem");
   if (s->img_x == x && s->img_y == y ? raw_len != (img_n * x + 1) * y : raw_len < (img_n * x + 1) * y)
      return e("not enough pixels");
   const u32 row = x * img_n;
   const int n = img_n;
   for (j = 0; j < y; ++j) {
      u8 *cur = a->out + stride * j, *prior = cur - stride;
      int filter = *raw++;
      if (filter > 4) return e("invalid filter");
      if (j == 0) filter = first_row_filter[filter];
      if (img_n == out_n) {
         // fast path: filter switch hoisted out of the pixel loop, one tight loop per row
         switch (filter) {
            case F_none:
               memcpy(cur, raw, row); break;
            case F_sub:
               memcpy(cur, raw, n);
               for (i = n; i < row; ++i) cur[i] = raw[i] + cur[i - n];
               break;
            case F_up:
               for (i = 0; i < row; ++i) cur[i] = raw[i] + prior[i];
               break;
            case F_avg:
               for (i = 0; i < (u32)n; ++i) cur[i] = raw[i] + (prior[i] >> 1);
               for (; i < row; ++i) cur[i] = raw[i] + ((prior[i] + cur[i - n]) >> 1);
               break;
            case F_paeth:
               for (i = 0; i < (u32)n; ++i) cur[i] = raw[i] + prior[i];   // paeth(0,b,0) == b
               for (; i < row; ++i) cur[i] = (u8)(raw[i] + paeth(cur[i - n], prior[i], prior[i - n]));
               break;
            case F_avg_first:
               memcpy(cur, raw, n);
               for (i = n; i < row; ++i) cur[i] = raw[i] + (cur[i - n] >> 1);
               break;
            case F_paeth_first:                                            // paeth(a,0,0) == a
               memcpy(cur, raw, n);
               for (i = n; i < row; ++i) cur[i] = raw[i] + cur[i - n];
               break;
         }
         raw += row;
         continue;
      }
      // slow path: an alpha channel is being added (out_n == img_n + 1)
      for (k = 0; k < img_n; ++k) {
         switch (filter) {
            case F_up:    cur[k] = raw[k] + prior[k]; break;
            case F_avg:   cur[k] = raw[k] + (prior[k] >> 1); break;
            case F_paeth: cur[k] = (u8)(raw[k] + prior[k]); break;
            default:      cur[k] = raw[k]; break;
         }
      }
      cur[img_n] = 255;
      raw += img_n; cur += out_n; prior += out_n;
      for (i = x - 1; i >= 1; --i, raw += img_n, cur += out_n, prior += out_n) {
         cur[img_n] = 255;
         for (k = 0; k < img_n; ++k)
            switch (filter) {
               case F_none:        cur[k] = raw[k]; break;
               case F_sub:         cur[k] = raw[k] + cur[k - out_n]; break;
               case F_up:          cur[k] = raw[k] + prior[k]; break;
               case F_avg:         cur[k] = raw[k] + ((prior[k] + cur[k - out_n]) >> 1); break;
               case F_paeth:       cur[k] = (u8)(raw[k] + paeth(cur[k - out_n], prior[k], prior[k - out_n])); break;
               case F_avg_first:   cur[k] = raw[k] + (cur[k - out_n] >> 1); break;
               case F_paeth_first: cur[k] = (u8)(raw[k] + paeth(cur[k - out_n], 0, 0)); break;
            }
      }
   }
   return 1;
}

static int create_png_image(png *a, u8 *raw, u32 raw_len, int out_n, int interlaced) {
   u8 *final;
   if (!interlaced) return create_png_image_raw(a, raw, raw_len, out_n, a->s->img_x, a->s->img_y);
   final = (u8 *)malloc(a->s->img_x * a->s->img_y * out_n);
   if (!final) return e("outofmem");
   for (int p = 0; p < 7; ++p) {
      static const u8 xorig[] = {0,4,0,2,0,1,0}, yorig[] = {0,0,4,0,2,0,1};
      static const u8 xspc[]  = {8,8,4,4,2,2,1}, yspc[]  = {8,8,8,4,4,2,2};
      int i, j;
      int x = (a->s->img_x - xorig[p] + xspc[p] - 1) / xspc[p];
      int y = (a->s->img_y - yorig[p] + yspc[p] - 1) / yspc[p];
      if (x && y) {
         if (!create_png_image_raw(a, raw, raw_len, out_n, x, y)) { free(final); return 0; }
         for (j = 0; j < y; ++j)
            for (i = 0; i < x; ++i)
               memcpy(final + (j*yspc[p]+yorig[p]) * a->s->img_x * out_n + (i*xspc[p]+xorig[p]) * out_n,
                      a->out + (j*x+i) * out_n, out_n);
         free(a->out);
         raw += (x*out_n+1)*y;
         raw_len -= (x*out_n+1)*y;
      }
   }
   a->out = final;
   return 1;
}

static void compute_transparency(png *z, u8 tc[3], int out_n) {
   u32 i, pixel_count = z->s->img_x * z->s->img_y;
   u8 *p = z->out;
   for (i = 0; i < pixel_count; ++i, p += out_n)
      if (out_n == 2) p[1] = p[0] == tc[0] ? 0 : 255;
      else if (p[0] == tc[0] && p[1] == tc[1] && p[2] == tc[2]) p[3] = 0;
}

static int expand_palette(png *a, u8 *palette, int pal_img_n) {
   u32 i, pixel_count = a->s->img_x * a->s->img_y;
   u8 *p = (u8 *)malloc(pixel_count * pal_img_n), *t = p, *orig = a->out;
   if (!p) return e("outofmem");
   if (pal_img_n == 4) {
      for (i = 0; i < pixel_count; ++i, p += 4) memcpy(p, palette + orig[i] * 4, 4);
   } else {
      for (i = 0; i < pixel_count; ++i, p += 3) {
         const u8 *c = palette + orig[i] * 4;
         p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
      }
   }
   free(a->out);
   a->out = t;
   return 1;
}

static int parse_png_file(png *z, int req_comp) {
   u8 palette[1024], pal_img_n = 0, has_trans = 0, tc[3];
   u32 ioff = 0, idata_limit = 0, i, pal_len = 0;
   int first = 1, k, interlace = 0;
   stbi *s = z->s;
   z->expanded = NULL; z->idata = NULL; z->out = NULL;
   skip(s, 8);                                        // signature already verified
   for (;;) {
      u32 clen = get32(s), ctype = get32(s);
      if (clen > (u32)(s->end - s->p)) return e("truncated");
      switch (ctype) {
         case PNG_TYPE('I','H','D','R'): {
            int depth, color;
            if (!first) return e("multiple IHDR");
            first = 0;
            if (clen != 13) return e("bad IHDR len");
            s->img_x = get32(s); if (s->img_x > (1 << 24)) return e("too large");
            s->img_y = get32(s); if (s->img_y > (1 << 24)) return e("too large");
            depth = get8(s);  if (depth != 8) return e("8bit only");
            color = get8(s);  if (color > 6)  return e("bad ctype");
            if (color == 3) pal_img_n = 3; else if (color & 1) return e("bad ctype");
            if (get8(s) || get8(s)) return e("bad method");
            interlace = get8(s); if (interlace > 1) return e("bad interlace method");
            if (!s->img_x || !s->img_y) return e("0-pixel image");
            if (!pal_img_n) {
               s->img_n = (color & 2 ? 3 : 1) + (color & 4 ? 1 : 0);
               if ((1 << 30) / s->img_x / s->img_n < s->img_y) return e("too large");
            } else {
               s->img_n = 1;
               if ((1 << 30) / s->img_x / 4 < s->img_y) return e("too large");
            }
            break;
         }
         case PNG_TYPE('P','L','T','E'):
            if (first || clen > 256 * 3 || clen % 3) return e("invalid PLTE");
            pal_len = clen / 3;
            for (i = 0; i < pal_len; ++i) {
               palette[i*4+0] = get8u(s); palette[i*4+1] = get8u(s); palette[i*4+2] = get8u(s);
               palette[i*4+3] = 255;
            }
            break;
         case PNG_TYPE('t','R','N','S'):
            if (first) return e("first not IHDR");
            if (z->idata) return e("tRNS after IDAT");
            if (pal_img_n) {
               if (pal_len == 0) return e("tRNS before PLTE");
               if (clen > pal_len) return e("bad tRNS len");
               pal_img_n = 4;
               for (i = 0; i < clen; ++i) palette[i*4+3] = get8u(s);
            } else {
               if (!(s->img_n & 1)) return e("tRNS with alpha");
               if (clen != (u32)s->img_n * 2) return e("bad tRNS len");
               has_trans = 1;
               for (k = 0; k < s->img_n; ++k) tc[k] = (u8)get16(s);
            }
            break;
         case PNG_TYPE('p','H','Y','s'): {
            if (first) return e("first not IHDR");
            if (clen != 9) { skip(s, clen); break; }
            u32 x_ppu = get32(s);
            u32 y_ppu = get32(s);
            u8 unit = get8(s);
            if (unit == 1) { // meter
               s->dpi_x = (int)(x_ppu * 0.0254 + 0.5);
               s->dpi_y = (int)(y_ppu * 0.0254 + 0.5);
            }
            break;
         }
         case PNG_TYPE('I','D','A','T'):
            if (first) return e("first not IHDR");
            if (pal_img_n && !pal_len) return e("no PLTE");
            if (ioff + clen > idata_limit) {
               u8 *p;
               if (idata_limit == 0) idata_limit = clen > 4096 ? clen : 4096;
               while (ioff + clen > idata_limit) idata_limit *= 2;
               p = (u8 *)realloc(z->idata, idata_limit);
               if (!p) return e("outofmem");
               z->idata = p;
            }
            if (!getn(s, z->idata + ioff, clen)) return e("outofdata");
            ioff += clen;
            break;
         case PNG_TYPE('I','E','N','D'): {
            int raw_len;
            if (first) return e("first not IHDR");
            if (!z->idata) return e("no IDAT");
            z->expanded = zdecode(z->idata, ioff, &raw_len, (size_t)(s->img_x * s->img_n + 1) * s->img_y);
            if (!z->expanded) return 0;
            free(z->idata); z->idata = NULL;
            s->img_out_n = ((req_comp == s->img_n + 1 && req_comp != 3 && !pal_img_n) || has_trans) ? s->img_n + 1 : s->img_n;
            if (!create_png_image(z, z->expanded, raw_len, s->img_out_n, interlace)) return 0;
            if (has_trans) compute_transparency(z, tc, s->img_out_n);
            if (pal_img_n) {
               s->img_n = s->img_out_n = pal_img_n;
               if (req_comp >= 3) s->img_out_n = req_comp;
               if (!expand_palette(z, palette, s->img_out_n)) return 0;
            }
            free(z->expanded); z->expanded = NULL;
            return 1;
         }
         default:
            if (first) return e("first not IHDR");
            if (!(ctype & (1 << 29))) return e("chunk not known");   // unknown critical chunk
            skip(s, clen);
            break;
      }
      get32(s);                                       // CRC (not verified)
   }
}

static u8 *png_load(stbi *s, int *x, int *y, int *n, int req_comp) {
   png p;
   u8 *result = NULL;
   p.s = s;
   if (req_comp < 0 || req_comp > 4) return epuc("bad req_comp");
   if (parse_png_file(&p, req_comp)) {
      result = p.out; p.out = NULL;
      if (req_comp && req_comp != s->img_out_n) {
         result = convert_format(result, s->img_out_n, req_comp, s->img_x, s->img_y);
         s->img_out_n = req_comp;
         if (!result) return result;
      }
      *x = s->img_x; *y = s->img_y; *n = s->img_n;
   }
   free(p.out); free(p.expanded); free(p.idata);
   return result;
}

// ============================ GIF (first frame only) ============================
typedef struct { short prefix; u8 first, suffix; } gif_lzw;

typedef struct {
   int w, h;
   u8 *out;
   int flags, bgindex, ratio, transparent, eflags;
   u8 pal[256][4], lpal[256][4];
   gif_lzw codes[4096];
   u8 *color_table;
   int parse, step, lflags, start_x, start_y, max_x, max_y, cur_x, cur_y, line_size;
} stbi_gif;

static void gif_parse_colortable(stbi *s, u8 pal[256][4], int num_entries, int transp) {
   for (int i = 0; i < num_entries; ++i) {
      pal[i][2] = get8u(s); pal[i][1] = get8u(s); pal[i][0] = get8u(s);
      pal[i][3] = transp ? 0 : 255;
   }
}

static void gif_out_code(stbi_gif *g, u16 code) {
   u8 *p, *c;
   if (g->codes[code].prefix >= 0) gif_out_code(g, g->codes[code].prefix);
   if (g->cur_y >= g->max_y) return;
   p = &g->out[g->cur_x + g->cur_y];
   c = &g->color_table[g->codes[code].suffix * 4];
   if (c[3] >= 128) { p[0] = c[2]; p[1] = c[1]; p[2] = c[0]; p[3] = c[3]; }
   g->cur_x += 4;
   if (g->cur_x >= g->max_x) {
      g->cur_x = g->start_x;
      g->cur_y += g->step;
      while (g->cur_y >= g->max_y && g->parse > 0) {
         g->step = (1 << g->parse) * g->line_size;
         g->cur_y = g->start_y + (g->step >> 1);
         --g->parse;
      }
   }
}

static u8 *gif_process_raster(stbi *s, stbi_gif *g) {
   u8 lzw_cs = get8u(s);
   int len = 0, code, codesize, codemask, avail, oldcode = -1, bits = 0, valid_bits = 0;
   int clear = 1 << lzw_cs, first = 1;
   gif_lzw *p;
   codesize = lzw_cs + 1;
   codemask = (1 << codesize) - 1;
   for (code = 0; code < clear; code++) {
      g->codes[code].prefix = -1;
      g->codes[code].first = g->codes[code].suffix = (u8)code;
   }
   avail = clear + 2;
   for (;;) {
      if (valid_bits < codesize) {
         if (len == 0) { len = get8(s); if (len == 0) return g->out; }
         --len;
         bits |= get8(s) << valid_bits;
         valid_bits += 8;
      } else {
         code = bits & codemask;
         bits >>= codesize; valid_bits -= codesize;
         if (code == clear) {
            codesize = lzw_cs + 1;
            codemask = (1 << codesize) - 1;
            avail = clear + 2; oldcode = -1; first = 0;
         } else if (code == clear + 1) {
            skip(s, len);
            while ((len = get8(s)) > 0) skip(s, len);
            return g->out;
         } else if (code <= avail) {
            if (first) return epuc("no clear code");
            if (oldcode >= 0) {
               p = &g->codes[avail++];
               if (avail > 4096) return epuc("too many codes");
               p->prefix = (short)oldcode;
               p->first = g->codes[oldcode].first;
               p->suffix = (code == avail) ? p->first : g->codes[code].first;
            } else if (code == avail) return epuc("illegal code in raster");
            gif_out_code(g, (u16)code);
            if ((avail & codemask) == 0 && avail <= 0x0FFF) { codesize++; codemask = (1 << codesize) - 1; }
            oldcode = code;
         } else return epuc("illegal code in raster");
      }
   }
}

static u8 *gif_load(stbi *s, int *x, int *y, int *comp, int req_comp) {
   stbi_gif g;
   int i;
   memset(&g, 0, sizeof(g));
   skip(s, 6);                                        // "GIF89a" already verified
   g.w = get16le(s); g.h = get16le(s);
   g.flags = get8(s); g.bgindex = get8(s); g.ratio = get8(s);
   g.transparent = -1;
   *comp = 4;
   if (g.flags & 0x80) gif_parse_colortable(s, g.pal, 2 << (g.flags & 7), -1);
   g.out = (u8 *)malloc(4 * g.w * g.h);
   if (!g.out) return epuc("outofmem");
   for (i = 0; i < g.w * g.h * 4; i += 4) {           // fill background
      u8 *c = g.pal[g.bgindex], *p = &g.out[i];
      p[0] = c[2]; p[1] = c[1]; p[2] = c[0]; p[3] = c[3];
   }
   for (;;) {
      switch (get8(s)) {
         case 0x2C: {                                  // image descriptor
            int ix = get16le(s), iy = get16le(s), w = get16le(s), h = get16le(s);
            u8 *o;
            if (ix + w > g.w || iy + h > g.h) { free(g.out); return epuc("bad Image Descriptor"); }
            g.line_size = g.w * 4;
            g.start_x = ix * 4; g.start_y = iy * g.line_size;
            g.max_x = g.start_x + w * 4; g.max_y = g.start_y + h * g.line_size;
            g.cur_x = g.start_x; g.cur_y = g.start_y;
            g.lflags = get8(s);
            if (g.lflags & 0x40) { g.step = 8 * g.line_size; g.parse = 3; }
            else                 { g.step = g.line_size;     g.parse = 0; }
            if (g.lflags & 0x80) {
               gif_parse_colortable(s, g.lpal, 2 << (g.lflags & 7), g.eflags & 1 ? g.transparent : -1);
               g.color_table = (u8 *)g.lpal;
            } else if (g.flags & 0x80) {
               for (i = 0; i < 256; ++i) g.pal[i][3] = 255;
               if (g.transparent >= 0 && (g.eflags & 1)) g.pal[g.transparent][3] = 0;
               g.color_table = (u8 *)g.pal;
            } else { free(g.out); return epuc("missing color table"); }
            o = gif_process_raster(s, &g);
            if (!o) { free(g.out); return NULL; }
            if (req_comp && req_comp != 4) o = convert_format(o, 4, req_comp, g.w, g.h);
            if (o) { *x = g.w; *y = g.h; }
            return o;
         }
         case 0x21: {                                  // extension
            int len;
            if (get8(s) == 0xF9) {                     // graphic control
               len = get8(s);
               if (len == 4) { g.eflags = get8(s); get16le(s); g.transparent = get8(s); }
               else { skip(s, len); break; }
            }
            while ((len = get8(s)) != 0) skip(s, len);
            break;
         }
         default:                                      // 0x3B (end) or garbage
            free(g.out);
            return epuc("unknown code");
      }
   }
}

// ============================ dispatch ============================
static u8 *load_mem(const u8 *buf, int len, int *x, int *y, int *comp, int req_comp, int *out_dpi_x, int *out_dpi_y) {
   stbi s;
   s.p = (u8 *)buf; s.end = (u8 *)buf + len;
   s.dpi_x = 72; s.dpi_y = 72;
   u8 *res = NULL;
   if (len > 1 && buf[0] == 0xff && buf[1] == 0xd8) res = jpeg_load(&s, x, y, comp, req_comp);
   else if (len >= 8 && !memcmp(buf, "\x89PNG\r\n\x1a\n", 8)) res = png_load(&s, x, y, comp, req_comp);
   else if (len >= 6 && !memcmp(buf, "GIF8", 4) && (buf[4] == '7' || buf[4] == '9') && buf[5] == 'a')
      res = gif_load(&s, x, y, comp, req_comp);
   else res = epuc("unknown image type");
   
   if (out_dpi_x) *out_dpi_x = s.dpi_x;
   if (out_dpi_y) *out_dpi_y = s.dpi_y;
   return res;
}

// ============================ public API ============================
class Image {
public:
   Image() : data(nullptr), w(0), h(0), comp(0), dpi_x(72), dpi_y(72) {}
   ~Image() { free(); }
   Image(const Image &) = delete;
   Image &operator=(const Image &) = delete;

   bool loadFromMemory(const unsigned char *buffer, int len, int req_comp = 0) {
      free();
      int dpi_x = 72, dpi_y = 72;
      data = load_mem(buffer, len, &w, &h, &comp, req_comp, &dpi_x, &dpi_y);
      this->dpi_x = dpi_x;
      this->dpi_y = dpi_y;
      return data != nullptr;
   }

   bool loadFromFile(const char *filename, int req_comp = 0) {
      free();
      FILE *f = fopen(filename, "rb");
      if (!f) return false;
      fseek(f, 0, SEEK_END);
      long n = ftell(f);
      fseek(f, 0, SEEK_SET);
      u8 *b = n > 0 ? (u8 *)malloc(n) : nullptr;
      if (b && fread(b, 1, n, f) == (size_t)n) loadFromMemory(b, (int)n, req_comp);
      ::free(b);
      fclose(f);
      return data != nullptr;
   }

   void free() { ::free(data); data = nullptr; w = h = comp = 0; dpi_x = dpi_y = 72; }

   int getWidth() const { return w; }
   int getHeight() const { return h; }
   int getChannels() const { return comp; }
   int getDpiX() const { return dpi_x; }
   int getDpiY() const { return dpi_y; }
   unsigned char *getData() { return data; }
   const unsigned char *getData() const { return data; }
#ifdef IMG_ERROR_STRINGS
   static const char *getFailureReason() { return g_err; }
#else
   static const char *getFailureReason() { return "image load failed"; }
#endif

private:
   unsigned char *data;
   int w, h, comp, dpi_x, dpi_y;
};
#endif