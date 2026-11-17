// Size-optimized image loader: baseline JPEG, 8-bit PNG (incl. interlaced), GIF (first frame).
// Public API: class Image only. Build: g++ -Os -fno-exceptions -fno-rtti -flto -ffunction-sections -fdata-sections -Wl,--gc-sections
//             (emscripten: -Oz -flto)
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

typedef struct { u32 img_x, img_y; int img_n, img_out_n, dpi_x, dpi_y; u8 *p, *end; } stbi;

static int get8(stbi *s) { return s->p < s->end ? *s->p++ : 0; }
static int at_eof(stbi *s) { return s->p >= s->end; }
static void skip(stbi *s, u32 n) { size_t r = s->end - s->p; s->p += n > r ? r : n; }
static int getn(stbi *s, u8 *b, u32 n) {
	if ((size_t)(s->end - s->p) < n) return 0;
	memcpy(b, s->p, n); s->p += n; return 1;
}
static int get16(stbi *s) { int z = get8(s); return (z << 8) + get8(s); }
static u32 get32(stbi *s) { u32 z = get16(s); return (z << 16) + get16(s); }
static int get16le(stbi *s) { int z = get8(s); return z + (get8(s) << 8); }

static u8 compute_y(int r, int g, int b) { return (u8)(((r * 77) + (g * 150) + (29 * b)) >> 8); }
static u8 clamp(int x) { return x < 0 ? 0 : x > 255 ? 255 : (u8)x; }

// Generic channel conversion (1=Y, 2=YA, 3=RGB, 4=RGBA).
static u8 *convert_format(u8 *data, int n, int req, u32 x, u32 y) {
	if (req == n) return data;
	u8 *good = (u8 *)malloc(req * x * y), *d = good, *s = data;
	if (!good) { free(data); return epuc("outofmem"); }
	for (u32 i = x * y; i; --i, s += n, d += req) {
		int r = s[0], g = n > 2 ? s[1] : r, b = n > 2 ? s[2] : r, a = n & 1 ? 255 : s[n - 1];
		if (req < 3) { d[0] = compute_y(r, g, b); if (req == 2) d[1] = (u8)a; }
		else { d[0] = (u8)r; d[1] = (u8)g; d[2] = (u8)b; if (req == 4) d[3] = (u8)a; }
	}
	free(data);
	return good;
}

// ============================ JPEG ============================
typedef struct { u8 values[256], size[257]; u32 maxcode[18]; int delta[17]; } huffman;

typedef struct {
	stbi *s;
	huffman huff_dc[4], huff_ac[4];
	u8 dequant[4][64];
	int img_h_max, img_v_max, img_mcu_x, img_mcu_y, img_mcu_w, img_mcu_h;
	struct { int id, h, v, tq, hd, ha, dc_pred, x, y, w2, h2; u8 *data; void *raw_data; u8 *linebuf; } img_comp[3];
	u32 code_buffer;
	int code_bits;
	u8 marker;
	int nomore, scan_n, order[3], restart_interval, todo;
} jpeg;

static int build_huffman(huffman *h, int *count) {
	int i, j, k = 0, code = 0;
	for (i = 0; i < 16; ++i) for (j = 0; j < count[i]; ++j) h->size[k++] = (u8)(i + 1);
	h->size[k] = 0;
	k = 0;
	for (j = 1; j <= 16; ++j) {
		h->delta[j] = k - code;
		if (h->size[k] == j) {
			while (h->size[k] == j) ++k, ++code;
			if (code - 1 >= (1 << j)) return e("bad code lengths");
		}
		h->maxcode[j] = code << (16 - j);
		code <<= 1;
	}
	h->maxcode[j] = 0xffffffff;
	return 1;
}

static void grow_buffer_unsafe(jpeg *j) {
	do {
		int b = j->nomore ? 0 : get8(j->s);
		if (b == 0xff) {
			int c = get8(j->s);
			if (c != 0) { j->marker = (u8)c; j->nomore = 1; return; }
		}
		j->code_buffer |= b << (24 - j->code_bits);
		j->code_bits += 8;
	} while (j->code_bits <= 24);
}

#define BM(n) ((1u << (n)) - 1)

static int decode(jpeg *j, huffman *h) {
	u32 temp;
	int k;
	if (j->code_bits < 16) grow_buffer_unsafe(j);
	temp = j->code_buffer >> 16;
	for (k = 1; temp >= h->maxcode[k]; ++k);        // maxcode[17] is all ones: always terminates
	if (k == 17) { j->code_bits -= 16; return -1; }
	if (k > j->code_bits) return -1;
	temp = ((j->code_buffer >> (32 - k)) & BM(k)) + h->delta[k];
	j->code_bits -= k; j->code_buffer <<= k;
	return h->values[temp];
}

static int extend_receive(jpeg *j, int n) {
	u32 k;
	if (j->code_bits < n) grow_buffer_unsafe(j);
	k = (j->code_buffer >> (32 - n)) & BM(n);
	j->code_bits -= n; j->code_buffer <<= n;
	return k < (1u << (n - 1)) ? (-1 << n) + (int)k + 1 : (int)k;
}

static const u8 dezigzag[64 + 16] = {
	0,  1,  8, 16,  9,  2,  3, 10, 17, 24, 32, 25, 18, 11,  4,  5,
	12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13,  6,  7, 14, 21, 28,
	35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
	58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
	63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63
};

static int decode_block(jpeg *j, short data[64], huffman *hdc, huffman *hac, int b) {
	int t = decode(j, hdc), k = 1;
	if (t < 0) return e("bad huffman code");
	memset(data, 0, 64 * sizeof(short));
	j->img_comp[b].dc_pred += t ? extend_receive(j, t) : 0;
	data[0] = (short)j->img_comp[b].dc_pred;
	do {
		int rs = decode(j, hac), s = rs & 15;
		if (rs < 0) return e("bad huffman code");
		if (!s) { if (rs != 0xf0) break; k += 16; }
		else { k += rs >> 4; data[dezigzag[k++]] = (short)extend_receive(j, s); }
	} while (k < 64);
	return 1;
}

#define f2f(x) (int)(((x) * 4096 + 0.5))

// One 8-point 1-D IDCT; o[] gets the unrounded results.
static void idct1d(const int *s, int st, int o[8]) {
	int t0, t1, t2, t3, p1, p2, p3, p4, p5, x0, x1, x2, x3;
	p2 = s[2 * st]; p3 = s[6 * st];
	p1 = (p2 + p3) * f2f(0.5411961f);
	t2 = p1 + p3 * f2f(-1.847759065f);
	t3 = p1 + p2 * f2f(0.765366865f);
	p2 = s[0]; p3 = s[4 * st];
	t0 = (p2 + p3) << 12; t1 = (p2 - p3) << 12;
	x0 = t0 + t3; x3 = t0 - t3;
	x1 = t1 + t2; x2 = t1 - t2;
	t0 = s[7 * st]; t1 = s[5 * st]; t2 = s[3 * st]; t3 = s[st];
	p3 = t0 + t2; p4 = t1 + t3;
	p1 = t0 + t3; p2 = t1 + t2;
	p5 = (p3 + p4) * f2f(1.175875602f);
	t0 *= f2f(0.298631336f);
	t1 *= f2f(2.053119869f);
	t2 *= f2f(3.072711026f);
	t3 *= f2f(1.501321110f);
	p1 = p5 + p1 * f2f(-0.899976223f);
	p2 = p5 + p2 * f2f(-2.562915447f);
	p3 *= f2f(-1.961570560f);
	p4 *= f2f(-0.390180644f);
	t3 += p1 + p4; t2 += p2 + p3;
	t1 += p2 + p4; t0 += p1 + p3;
	o[0] = x0 + t3; o[7] = x0 - t3;
	o[1] = x1 + t2; o[6] = x1 - t2;
	o[2] = x2 + t1; o[5] = x2 - t1;
	o[3] = x3 + t0; o[4] = x3 - t0;
}

static void idct_block(u8 *out, int stride, short *d, u8 *dq) {
	int v[64], o[8], i, r;
	for (i = 0; i < 64; ++i) v[i] = d[i] * dq[i];
	for (i = 0; i < 8; ++i) {
		idct1d(v + i, 8, o);
		for (r = 0; r < 8; ++r) v[i + r * 8] = (o[r] + 512) >> 10;
	}
	for (i = 0; i < 8; ++i, out += stride) {
		idct1d(v + i * 8, 1, o);
		for (r = 0; r < 8; ++r) out[r] = clamp((o[r] + 65536 + (128 << 17)) >> 17);
	}
}

#define MARKER_none 0xff

static u8 get_marker(jpeg *j) {
	u8 x;
	if (j->marker != MARKER_none) { x = j->marker; j->marker = MARKER_none; return x; }
	x = (u8)get8(j->s);
	if (x != 0xff) return MARKER_none;
	while (x == 0xff) x = (u8)get8(j->s);
	return x;
}

static void reset(jpeg *j) {
	j->code_bits = 0; j->code_buffer = 0; j->nomore = 0;
	j->img_comp[0].dc_pred = j->img_comp[1].dc_pred = j->img_comp[2].dc_pred = 0;
	j->marker = MARKER_none;
	j->todo = j->restart_interval ? j->restart_interval : 0x7fffffff;
}

static int do_block(jpeg *z, int n, int x, int y) {
	short data[64];
	int w2 = z->img_comp[n].w2;
	if (!decode_block(z, data, z->huff_dc + z->img_comp[n].hd, z->huff_ac + z->img_comp[n].ha, n)) return 0;
	idct_block(z->img_comp[n].data + w2 * y + x, w2, data, z->dequant[z->img_comp[n].tq]);
	return 1;
}

static int parse_entropy_coded_data(jpeg *z) {
	int i, j, k, x, y, mx = z->img_mcu_x, my = z->img_mcu_y, single = z->scan_n == 1;
	reset(z);
	if (single) {                                      // non-interleaved: one block per "MCU"
		int n = z->order[0];
		mx = (z->img_comp[n].x + 7) >> 3; my = (z->img_comp[n].y + 7) >> 3;
	}
	for (j = 0; j < my; ++j)
	for (i = 0; i < mx; ++i) {
		for (k = 0; k < z->scan_n; ++k) {
			int n = z->order[k], bh = single ? 1 : z->img_comp[n].h, bv = single ? 1 : z->img_comp[n].v;
			for (y = 0; y < bv; ++y)
			for (x = 0; x < bh; ++x)
			if (!do_block(z, n, (i * bh + x) * 8, (j * bv + y) * 8)) return 0;
		}
		if (--z->todo <= 0) {
			if (z->code_bits < 24) grow_buffer_unsafe(z);
			if (!(z->marker >= 0xd0 && z->marker <= 0xd7)) return 1;
			reset(z);
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
			int q = get8(z->s), t = q & 15, i;
			if (q >> 4) return e("bad DQT type");
			if (t > 3) return e("bad DQT table");
			for (i = 0; i < 64; ++i) z->dequant[t][dezigzag[i]] = (u8)get8(z->s);
			L -= 65;
		}
		return L == 0;
		case 0xC4:
		L = get16(z->s) - 2;
		while (L > 0) {
			int sizes[16], i, n = 0, q = get8(z->s), tc = q >> 4, th = q & 15;
			huffman *h;
			if (tc > 1 || th > 3) return e("bad DHT header");
			for (i = 0; i < 16; ++i) n += sizes[i] = get8(z->s);
			if (n > 256) return e("bad DHT");
			L -= 17 + n;
			h = (tc ? z->huff_ac : z->huff_dc) + th;
			if (!build_huffman(h, sizes)) return 0;
			for (i = 0; i < n; ++i) h->values[i] = (u8)get8(z->s);
		}
		return L == 0;
	}
	if ((m >= 0xE0 && m <= 0xEF) || m == 0xFE) {       // APPn / COM; APP0 may carry JFIF density
		u8 id[5], *st;
		L = get16(z->s) - 2; st = z->s->p;
		if (m == 0xE0 && L >= 14 && getn(z->s, id, 5) && !memcmp(id, "JFIF", 5)) {
			int unit, xd, yd;
			get16(z->s); unit = get8(z->s); xd = get16(z->s); yd = get16(z->s);
			if (unit == 1) { z->s->dpi_x = xd; z->s->dpi_y = yd; }
			else if (unit == 2) { z->s->dpi_x = (xd * 254 + 50) / 100; z->s->dpi_y = (yd * 254 + 50) / 100; }
		}
		z->s->p = st; skip(z->s, L);
		return 1;
	}
	return 0;
}

static int process_scan_header(jpeg *z) {
	int i, Ls = get16(z->s);
	z->scan_n = get8(z->s);
	if (z->scan_n < 1 || z->scan_n > z->s->img_n) return e("bad SOS component count");
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
	for (i = 0; i < c; ++i) z->img_comp[i].data = z->img_comp[i].linebuf = NULL;
	if (Lf != 8 + 3 * c) return e("bad SOF len");
	for (i = 0; i < c; ++i) {
		z->img_comp[i].id = get8(s);
		if (z->img_comp[i].id != i + 1 && z->img_comp[i].id != i) return e("bad component ID");
		q = get8(s);
		z->img_comp[i].h = q >> 4;   if (!z->img_comp[i].h || z->img_comp[i].h > 4) return e("bad H");
		z->img_comp[i].v = q & 15;   if (!z->img_comp[i].v || z->img_comp[i].v > 4) return e("bad V");
		z->img_comp[i].tq = get8(s); if (z->img_comp[i].tq > 3) return e("bad TQ");
	}
	if ((1 << 30) / s->img_x / c < s->img_y) return e("too large");
	for (i = 0; i < c; ++i) {
		if (z->img_comp[i].h > h_max) h_max = z->img_comp[i].h;
		if (z->img_comp[i].v > v_max) v_max = z->img_comp[i].v;
	}
	z->img_h_max = h_max; z->img_v_max = v_max;
	z->img_mcu_w = h_max * 8; z->img_mcu_h = v_max * 8;
	z->img_mcu_x = (s->img_x + z->img_mcu_w - 1) / z->img_mcu_w;
	z->img_mcu_y = (s->img_y + z->img_mcu_h - 1) / z->img_mcu_h;
	for (i = 0; i < c; ++i) {
		z->img_comp[i].x = (s->img_x * z->img_comp[i].h + h_max - 1) / h_max;
		z->img_comp[i].y = (s->img_y * z->img_comp[i].v + v_max - 1) / v_max;
		z->img_comp[i].w2 = z->img_mcu_x * z->img_comp[i].h * 8;
		z->img_comp[i].h2 = z->img_mcu_y * z->img_comp[i].v * 8;
		z->img_comp[i].raw_data = malloc(z->img_comp[i].w2 * z->img_comp[i].h2 + 15);
		if (!z->img_comp[i].raw_data) return e("outofmem");   // caller's cleanup frees earlier components
		z->img_comp[i].data = (u8 *)(((size_t)z->img_comp[i].raw_data + 15) & ~(size_t)15);
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
					if (x == 255) { j->marker = (u8)get8(j->s); break; }
					else if (x != 0) return 0;
				}
			}
		} else if (!process_marker(j, m)) return 0;
		m = get_marker(j);
	}
	return 1;
}

// Chroma upsampling (the usual 3/4-1/4 "fancy" filter) for subsampling factors 1 and 2; nearest otherwise.
// V() is the vertically blended sample, scaled by 4.
#define V(i) (vs == 2 ? 3 * nr[i] + fr[i] : nr[i] * 4)
static void resample_row(u8 *out, u8 *nr, u8 *fr, int w, int hs, int vs) {
	int i, j;
	if (hs > 2 || vs > 2) {
		for (i = 0; i < w; ++i) for (j = 0; j < hs; ++j) out[i * hs + j] = nr[i];
		return;
	}
	for (i = 0; i < w; ++i) {
		int c = V(i);
		if (hs == 1) out[i] = (u8)((c + 2) >> 2);
		else {
			out[i * 2]     = (u8)((3 * c + V(i ? i - 1 : 0) + 8) >> 4);
			out[i * 2 + 1] = (u8)((3 * c + V(i < w - 1 ? i + 1 : i) + 8) >> 4);
		}
	}
}
#undef V

#define float2fixed(x) ((int)((x) * 65536 + 0.5))

static void YCbCr_to_RGB_row(u8 *out, const u8 *y, const u8 *pcb, const u8 *pcr, int count, int step) {
	for (int i = 0; i < count; ++i, out += step) {
		int y_fixed = (y[i] << 16) + 32768, cr = pcr[i] - 128, cb = pcb[i] - 128;
		out[0] = clamp((y_fixed + cr * float2fixed(1.40200f)) >> 16);
		out[1] = clamp((y_fixed - cr * float2fixed(0.71414f) - cb * float2fixed(0.34414f)) >> 16);
		out[2] = clamp((y_fixed + cb * float2fixed(1.77200f)) >> 16);
		out[3] = 255;
	}
}

static void cleanup_jpeg(jpeg *j) {
	for (int i = 0; i < j->s->img_n; ++i) {
		if (j->img_comp[i].data) { free(j->img_comp[i].raw_data); j->img_comp[i].data = NULL; }
		free(j->img_comp[i].linebuf); j->img_comp[i].linebuf = NULL;
	}
}

typedef struct { u8 *line0, *line1; int hs, vs, w_lores, ystep, ypos; } resamp;

static u8 *jpeg_load(stbi *s, int *out_x, int *out_y, int *comp, int req_comp) {
	jpeg z, *j = &z;
	int n, decode_n, k;
	u32 i, jj;
	u8 *output;
	resamp rs[3];
	j->s = s;
	if (req_comp < 0 || req_comp > 4) return epuc("bad req_comp");
	s->img_n = 0;
	if (!decode_jpeg_image(j)) { cleanup_jpeg(j); return NULL; }
	n = req_comp ? req_comp : s->img_n;
	decode_n = (s->img_n == 3 && n < 3) ? 1 : s->img_n;
	for (k = 0; k < decode_n; ++k) {
		resamp *r = &rs[k];
		j->img_comp[k].linebuf = (u8 *)malloc(s->img_x + 3);
		if (!j->img_comp[k].linebuf) { cleanup_jpeg(j); return epuc("outofmem"); }
		r->hs = j->img_h_max / j->img_comp[k].h;
		r->vs = j->img_v_max / j->img_comp[k].v;
		r->ystep = r->vs >> 1;
		r->w_lores = (s->img_x + r->hs - 1) / r->hs;
		r->ypos = 0;
		r->line0 = r->line1 = j->img_comp[k].data;
	}
	output = (u8 *)malloc(n * s->img_x * s->img_y + 1);
	if (!output) { cleanup_jpeg(j); return epuc("outofmem"); }
	for (jj = 0; jj < s->img_y; ++jj) {
		u8 *out = output + n * s->img_x * jj, *y = j->img_comp[0].linebuf;
		for (k = 0; k < decode_n; ++k) {
			resamp *r = &rs[k];
			int bot = r->ystep >= (r->vs >> 1);
			resample_row(j->img_comp[k].linebuf, bot ? r->line1 : r->line0, bot ? r->line0 : r->line1,
				r->w_lores, r->hs, r->vs);
			if (++r->ystep >= r->vs) {
				r->ystep = 0;
				r->line0 = r->line1;
				if (++r->ypos < j->img_comp[k].y) r->line1 += j->img_comp[k].w2;
			}
		}
		if (n >= 3) {
			if (s->img_n == 3) YCbCr_to_RGB_row(out, y, j->img_comp[1].linebuf, j->img_comp[2].linebuf, s->img_x, n);
			else for (i = 0; i < s->img_x; ++i) { out[0] = out[1] = out[2] = y[i]; out[3] = 255; out += n; }
		} else if (n == 1) memcpy(out, y, s->img_x);
		else for (i = 0; i < s->img_x; ++i) *out++ = y[i], *out++ = 255;
	}
	cleanup_jpeg(j);
	*out_x = s->img_x; *out_y = s->img_y; *comp = s->img_n;
	return output;
}

// ============================ zlib ============================
typedef struct { u16 firstcode[16], firstsymbol[16], value[288]; int maxcode[17]; } zhuffman;

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
	int i, k = 0, code = 0, next_code[16], sizes[17];
	memset(sizes, 0, sizeof(sizes));
	for (i = 0; i < num; ++i) ++sizes[sizelist[i]];
	sizes[0] = 0;
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
		if (s) z->value[next_code[s]++ - z->firstcode[s] + z->firstsymbol[s]] = (u16)i;
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
	int s, k;
	if (a->num_bits < 16) fill_bits(a);
	k = bit_reverse(a->code_buffer, 16);
	for (s = 1; k >= z->maxcode[s]; ++s);             // maxcode[16] > any 16-bit value
	if (s == 16) return -1;
	k = (k >> (16 - s)) - z->firstcode[s] + z->firstsymbol[s];
	a->code_buffer >>= s; a->num_bits -= s;
	return z->value[k];
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
			char *p;
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
			p = a->zout - dist;
			while (len--) *a->zout++ = *p++;          // forward copy handles overlap
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
				u8 dl[288], dd[32];
				int i;
				for (i = 0; i < 288; ++i) dl[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
				memset(dd, 5, 32);
				if (!zbuild_huffman(&a->z_length, dl, 288) || !zbuild_huffman(&a->z_distance, dd, 32)) return 0;
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

static int paeth(int a, int b, int c) {
	int p = a + b - c, pa = abs(p - a), pb = abs(p - b), pc = abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
}

// Unfilter. Out-of-image neighbours read as 0, which also gives the first-row/first-pixel filter variants.
static int create_png_image_raw(png *a, u8 *raw, u32 raw_len, int out_n, u32 x, u32 y) {
	stbi *s = a->s;
	u32 i, j, stride = x * out_n;
	int k, n = s->img_n;
	a->out = (u8 *)malloc(x * y * out_n);
	if (!a->out) return e("outofmem");
	if (s->img_x == x && s->img_y == y ? raw_len != (n * x + 1) * y : raw_len < (n * x + 1) * y)
	return e("not enough pixels");
	for (j = 0; j < y; ++j) {
		u8 *cur = a->out + stride * j, *prior = cur - stride;
		int f = *raw++;
		if (f > 4) return e("invalid filter");
		for (i = 0; i < x; ++i, cur += out_n, prior += out_n, raw += n) {
			if (out_n > n) cur[n] = 255;
			for (k = 0; k < n; ++k) {
				int A = i ? cur[k - out_n] : 0, B = j ? prior[k] : 0, C = i && j ? prior[k - out_n] : 0;
				cur[k] = (u8)(raw[k] + (f == 1 ? A : f == 2 ? B : f == 3 ? (A + B) >> 1 : f == 4 ? paeth(A, B, C) : 0));
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

static int expand_palette(png *a, u8 *palette, int pal_n) {
	u32 i, pixel_count = a->s->img_x * a->s->img_y;
	u8 *p = (u8 *)malloc(pixel_count * pal_n);
	if (!p) return e("outofmem");
	for (i = 0; i < pixel_count; ++i) memcpy(p + i * pal_n, palette + a->out[i] * 4, pal_n);
	free(a->out);
	a->out = p;
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
		if (first && ctype != PNG_TYPE('I','H','D','R')) return e("first not IHDR");
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
				s->img_n = pal_img_n ? 1 : (color & 2 ? 3 : 1) + (color & 4 ? 1 : 0);
				if ((1 << 30) / s->img_x / (pal_img_n ? 4 : s->img_n) < s->img_y) return e("too large");
				break;
			}
			case PNG_TYPE('P','L','T','E'):
			if (clen > 256 * 3 || clen % 3) return e("invalid PLTE");
			pal_len = clen / 3;
			for (i = 0; i < pal_len; ++i) {
				palette[i*4+0] = get8(s); palette[i*4+1] = get8(s); palette[i*4+2] = get8(s);
				palette[i*4+3] = 255;
			}
			break;
			case PNG_TYPE('t','R','N','S'):
			if (z->idata) return e("tRNS after IDAT");
			if (pal_img_n) {
				if (pal_len == 0) return e("tRNS before PLTE");
				if (clen > pal_len) return e("bad tRNS len");
				pal_img_n = 4;
				for (i = 0; i < clen; ++i) palette[i*4+3] = get8(s);
			} else {
				if (!(s->img_n & 1)) return e("tRNS with alpha");
				if (clen != (u32)s->img_n * 2) return e("bad tRNS len");
				has_trans = 1;
				for (k = 0; k < s->img_n; ++k) tc[k] = (u8)get16(s);
			}
			break;
			case PNG_TYPE('p','H','Y','s'):
			if (clen != 9) { skip(s, clen); break; }
			{
				u32 x_ppu = get32(s), y_ppu = get32(s);
				if (get8(s) == 1) {                    // meter
					s->dpi_x = (int)(((uint64_t)x_ppu * 254 + 5000) / 10000);
					s->dpi_y = (int)(((uint64_t)y_ppu * 254 + 5000) / 10000);
				}
			}
			break;
			case PNG_TYPE('I','D','A','T'):
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
		pal[i][2] = (u8)get8(s); pal[i][1] = (u8)get8(s); pal[i][0] = (u8)get8(s);
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
	u8 lzw_cs = (u8)get8(s);
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
static u8 *load_mem(const u8 *buf, int len, int *x, int *y, int *comp, int req_comp, int *dpi_x, int *dpi_y) {
	stbi s;
	u8 *res;
	s.p = (u8 *)buf; s.end = (u8 *)buf + len;
	s.dpi_x = s.dpi_y = 72;
	if (len > 1 && buf[0] == 0xff && buf[1] == 0xd8) res = jpeg_load(&s, x, y, comp, req_comp);
	else if (len >= 8 && !memcmp(buf, "\x89PNG\r\n\x1a\n", 8)) res = png_load(&s, x, y, comp, req_comp);
	else if (len >= 6 && !memcmp(buf, "GIF8", 4) && (buf[4] == '7' || buf[4] == '9') && buf[5] == 'a')
	res = gif_load(&s, x, y, comp, req_comp);
	else res = epuc("unknown image type");
	*dpi_x = s.dpi_x; *dpi_y = s.dpi_y;
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
		data = load_mem(buffer, len, &w, &h, &comp, req_comp, &dpi_x, &dpi_y);
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
