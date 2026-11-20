// ./font.hpp  (size-optimised + lazy glyph cache)
//
// Build flags:
//   FONT_NO_CFF   drop OpenType/CFF (Type 2 charstring) support, TrueType only. Biggest saving.
//   FONT_NO_FILE  drop load_file() (removes <cstdio>/<string> dependency)
//
// Suggested compile flags: -O2/-O3 (speed) or -Os/-Oz (size) -fno-exceptions -fno-rtti -flto
//                          -ffunction-sections -fdata-sections -Wl,--gc-sections
//
// Performance notes:
//   * Each codepoint gets one lazily-filled cache entry holding: glyph index, hmetrics,
//     bounding box and the parsed outline in FONT UNITS (scale independent).
//   * Changing pixel height never invalidates the cache; outlines are just re-scaled on emit.
//   * Not thread-safe (the cache is mutated by const-looking queries).
//
// SVG 2 §10.2 additions: OS/2 + head parsing exposes usWeightClass / fsSelection /
// sxHeight / sCapHeight / unitsPerEm, plus per-codepoint advances and kerning, so
// Canvas2D can do font-weight matching, italic detection and dominant-baseline maths.
#ifndef FONT_HPP
#define FONT_HPP
#include <graphics/path2d.hpp>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <vector>
#include <unordered_map>
#ifndef FONT_NO_FILE
#include <cstdio>
#include <string>
#endif
class Font {
	// ---------------------------------------------------------------- big-endian readers
	static uint16_t ttUSHORT(const unsigned char* p) { return p[0] << 8 | p[1]; }
	static int16_t ttSHORT(const unsigned char* p) { return (int16_t)ttUSHORT(p); }
	static uint32_t ttULONG(const unsigned char* p) { return (uint32_t)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }
	static uint32_t find_table(const unsigned char* data, uint32_t fontstart, const char* t, uint32_t* length = nullptr) {
		int n = ttUSHORT(data + fontstart + 4);
		for (int i = 0; i < n; ++i) {
			const unsigned char* e = data + fontstart + 12 + 16 * i;
			if (!memcmp(e, t, 4)) { if (length) *length = ttULONG(e + 12); return ttULONG(e + 8); }
		}
		if (length) *length = 0;
		return 0;
	}
	// ---------------------------------------------------------------- vertices
	enum { vmove = 1, vline, vcurve, vcubic };
	struct Vertex {
		int16_t x, y, cx, cy, cx1, cy1;
		unsigned char type;
	};
	static void setvertex(Vertex* v, unsigned char type, int32_t x, int32_t y, int32_t cx, int32_t cy) {
		v->type = type;
		v->x = (int16_t)x; v->y = (int16_t)y;
		v->cx = (int16_t)cx; v->cy = (int16_t)cy;
	}
	// ---------------------------------------------------------------- glyph cache
	struct Glyph {
		int index = 0;                 // glyph id
		int adv = 0, lsb = 0;          // font units
		int x0 = 0, y0 = 0, x1 = 0, y1 = 0;
		bool have_metrics = false, have_box = false, box_ok = false, have_path = false;
		std::vector<Vertex> verts;     // outline in font units
	};
	Glyph m_ascii[256];                          // direct-indexed fast path
	std::unordered_map<int, Glyph> m_glyphs;     // everything else (node-stable references)
	void clear_cache() {
		for (auto& g : m_ascii) g = Glyph();
		m_glyphs.clear();
	}
	// Lazily fills glyph index + hmetrics.
	Glyph& glyph(int cp) {
		Glyph& g = (cp >= 0 && cp < 256) ? m_ascii[cp] : m_glyphs[cp];
		if (!g.have_metrics) {
			g.index = lookup_glyph_index(cp);
			GetGlyphHMetrics(g.index, &g.adv, &g.lsb);
			g.have_metrics = true;
		}
		return g;
	}
	// Lazily parses the outline (only when a path is actually requested).
	const std::vector<Vertex>& outline(Glyph& g) {
		if (!g.have_path) {
			Vertex* v = nullptr;
			int n = GetGlyphShape(g.index, &v);
			if (n > 0) g.verts.assign(v, v + n);
			free(v);
			g.have_path = true;
		}
		return g.verts;
	}
	void ensure_box(Glyph& g) {
		if (!g.have_box) {
			g.box_ok = get_glyph_box(g.index, &g.x0, &g.y0, &g.x1, &g.y1);
			g.have_box = true;
		}
	}
	// Scale cached outline by m_scale, translate by ox, append to path.
	void emit(Path2D& path, const std::vector<Vertex>& vs, float ox) {
		if (vs.empty()) { path.current_x += ox; path.start_x += ox; return; }
		const float s = m_scale;
		for (const Vertex& v : vs) {
			float x = v.x * s + ox, y = v.y * s;
			switch (v.type) {
				case vmove: path.mt(x, y); break;
				case vline: path.lt(x, y); break;
				case vcurve: path.qt(v.cx * s + ox, v.cy * s, x, y); break;
				#ifndef FONT_NO_CFF
				case vcubic: path.ct(v.cx * s + ox, v.cy * s, v.cx1 * s + ox, v.cy1 * s, x, y); break;
				#endif
			}
		}
	}
	#ifndef FONT_NO_CFF
	// ---------------------------------------------------------------- CFF buffer helpers
	struct Buf {
		unsigned char* data = nullptr;
		int cursor = 0;
		int size = 0;
	};
	static unsigned char buf_get8(Buf* b) { return b->cursor >= b->size ? 0 : b->data[b->cursor++]; }
	static void buf_seek(Buf* b, int o) { b->cursor = (o > b->size || o < 0) ? b->size : o; }
	static void buf_skip(Buf* b, int o) { buf_seek(b, b->cursor + o); }
	static uint32_t buf_get(Buf* b, int n) {
		uint32_t v = 0;
		while (n--) v = (v << 8) | buf_get8(b);
		return v;
	}
	static Buf new_buf(const void* p, size_t size) {
		Buf r;
		r.data = (unsigned char*)p;
		r.size = (int)size;
		return r;
	}
	static Buf buf_range(Buf* b, int o, int s) {
		Buf r;
		if (o < 0 || s < 0 || o > b->size || s > b->size - o) return r;
		r.data = b->data + o;
		r.size = s;
		return r;
	}
	static Buf cff_get_index(Buf* b) {
		int start = b->cursor, count = buf_get(b, 2);
		if (count) {
			int offsize = buf_get8(b);
			buf_skip(b, offsize * count);
			buf_skip(b, buf_get(b, offsize) - 1);
		}
		return buf_range(b, start, b->cursor - start);
	}
	static uint32_t cff_int(Buf* b) {
		int b0 = buf_get8(b);
		if (b0 >= 32 && b0 <= 246) return b0 - 139;
		if (b0 >= 247 && b0 <= 250) return (b0 - 247) * 256 + buf_get8(b) + 108;
		if (b0 >= 251 && b0 <= 254) return -(b0 - 251) * 256 - buf_get8(b) - 108;
		if (b0 == 28) return buf_get(b, 2);
		if (b0 == 29) return buf_get(b, 4);
		return 0;
	}
	static void cff_skip_operand(Buf* b) {
		if (b->data[b->cursor] == 30) {
			buf_skip(b, 1);
			while (b->cursor < b->size) {
				int v = buf_get8(b);
				if ((v & 0xF) == 0xF || (v >> 4) == 0xF) break;
			}
		} else cff_int(b);
	}
	static Buf dict_get(Buf* b, int key) {
		buf_seek(b, 0);
		while (b->cursor < b->size) {
			int start = b->cursor;
			while (b->data[b->cursor] >= 28) cff_skip_operand(b);
			int end = b->cursor, op = buf_get8(b);
			if (op == 12) op = buf_get8(b) | 0x100;
			if (op == key) return buf_range(b, start, end - start);
		}
		return buf_range(b, 0, 0);
	}
	static void dict_get_ints(Buf* b, int key, int outcount, uint32_t* out) {
		Buf operands = dict_get(b, key);
		for (int i = 0; i < outcount && operands.cursor < operands.size; i++)
		out[i] = cff_int(&operands);
	}
	static int cff_index_count(Buf* b) { buf_seek(b, 0); return buf_get(b, 2); }
	static Buf cff_index_get(Buf b, int i) {
		buf_seek(&b, 0);
		int count = buf_get(&b, 2), offsize = buf_get8(&b);
		buf_skip(&b, i * offsize);
		int start = buf_get(&b, offsize), end = buf_get(&b, offsize);
		return buf_range(&b, 2 + (count + 1) * offsize + start, end - start);
	}
	static Buf get_subrs(Buf cff, Buf fontdict) {
		uint32_t subrsoff = 0, loc[2] = {0, 0};
		dict_get_ints(&fontdict, 18, 2, loc);
		if (!loc[1] || !loc[0]) return Buf();
		Buf pdict = buf_range(&cff, loc[1], loc[0]);
		dict_get_ints(&pdict, 19, 1, &subrsoff);
		if (!subrsoff) return Buf();
		buf_seek(&cff, loc[1] + subrsoff);
		return cff_get_index(&cff);
	}
	static Buf get_subr(Buf idx, int n) {
		int count = cff_index_count(&idx);
		n += count >= 33900 ? 32768 : count >= 1240 ? 1131 : 107;
		if (n < 0 || n >= count) return Buf();
		return cff_index_get(idx, n);
	}
	// ---------------------------------------------------------------- charstring interpreter
	struct CSContext {
		int bounds, started;
		float first_x, first_y, x, y;
		int32_t min_x, max_x, min_y, max_y;
		Vertex* pvertices;
		int num_vertices;
	};
	static void track_vertex(CSContext* c, int32_t x, int32_t y) {
		if (x > c->max_x || !c->started) c->max_x = x;
		if (y > c->max_y || !c->started) c->max_y = y;
		if (x < c->min_x || !c->started) c->min_x = x;
		if (y < c->min_y || !c->started) c->min_y = y;
		c->started = 1;
	}
	static void csctx_v(CSContext* c, unsigned char type, int32_t x, int32_t y,
		int32_t cx = 0, int32_t cy = 0, int32_t cx1 = 0, int32_t cy1 = 0) {
		if (c->bounds) {
			track_vertex(c, x, y);
			if (type == vcubic) { track_vertex(c, cx, cy); track_vertex(c, cx1, cy1); }
		} else {
			Vertex* v = &c->pvertices[c->num_vertices];
			setvertex(v, type, x, y, cx, cy);
			v->cx1 = (int16_t)cx1; v->cy1 = (int16_t)cy1;
		}
		c->num_vertices++;
	}
	static void csctx_close_shape(CSContext* c) {
		if (c->first_x != c->x || c->first_y != c->y)
		csctx_v(c, vline, (int)c->first_x, (int)c->first_y);
	}
	static void csctx_rmove_to(CSContext* c, float dx, float dy) {
		csctx_close_shape(c);
		c->first_x = c->x = c->x + dx;
		c->first_y = c->y = c->y + dy;
		csctx_v(c, vmove, (int)c->x, (int)c->y);
	}
	static void csctx_rline_to(CSContext* c, float dx, float dy) {
		c->x += dx; c->y += dy;
		csctx_v(c, vline, (int)c->x, (int)c->y);
	}
	static void csctx_rccurve_to(CSContext* c, float dx1, float dy1, float dx2, float dy2, float dx3, float dy3) {
		float cx1 = c->x + dx1, cy1 = c->y + dy1;
		float cx2 = cx1 + dx2, cy2 = cy1 + dy2;
		c->x = cx2 + dx3; c->y = cy2 + dy3;
		csctx_v(c, vcubic, (int)c->x, (int)c->y, (int)cx1, (int)cy1, (int)cx2, (int)cy2);
	}
	Buf cid_get_glyph_subrs(int glyph_index) {
		Buf fd = m_fdselect;
		int fdselector = -1;
		buf_seek(&fd, 0);
		int fmt = buf_get8(&fd);
		if (fmt == 0) {
			buf_skip(&fd, glyph_index);
			fdselector = buf_get8(&fd);
		} else if (fmt == 3) {
			int nranges = buf_get(&fd, 2), start = buf_get(&fd, 2);
			for (int i = 0; i < nranges; i++) {
				int v = buf_get8(&fd), end = buf_get(&fd, 2);
				if (glyph_index >= start && glyph_index < end) { fdselector = v; break; }
				start = end;
			}
		}
		if (fdselector == -1) return Buf();
		return get_subrs(m_cff, cff_index_get(m_fontdicts, fdselector));
	}
	int run_charstring(int glyph_index, CSContext* c) {
		int in_header = 1, maskbits = 0, subr_stack_height = 0, sp = 0, v, i, b0;
		int has_subrs = 0, clear_stack;
		float s[48], f;
		Buf subr_stack[10], subrs = m_subrs, b = cff_index_get(m_charstrings, glyph_index);
		while (b.cursor < b.size) {
			i = 0;
			clear_stack = 1;
			b0 = buf_get8(&b);
			switch (b0) {
				case 0x13: case 0x14:
				if (in_header) maskbits += sp / 2;
				in_header = 0;
				buf_skip(&b, (maskbits + 7) / 8);
				break;
				case 0x01: case 0x03: case 0x12: case 0x17:
				maskbits += sp / 2;
				break;
				case 0x15:
				in_header = 0;
				if (sp < 2) return 0;
				csctx_rmove_to(c, s[sp - 2], s[sp - 1]);
				break;
				case 0x04:
				in_header = 0;
				if (sp < 1) return 0;
				csctx_rmove_to(c, 0, s[sp - 1]);
				break;
				case 0x16:
				in_header = 0;
				if (sp < 1) return 0;
				csctx_rmove_to(c, s[sp - 1], 0);
				break;
				case 0x05:
				if (sp < 2) return 0;
				for (; i + 1 < sp; i += 2) csctx_rline_to(c, s[i], s[i + 1]);
				break;
				case 0x07:
				if (sp < 1) return 0;
				goto vlineto;
				case 0x06:
				if (sp < 1) return 0;
				for (;;) {
					if (i >= sp) break;
					csctx_rline_to(c, s[i], 0);
					i++;
					vlineto:
					if (i >= sp) break;
					csctx_rline_to(c, 0, s[i]);
					i++;
				}
				break;
				case 0x1F:
				if (sp < 4) return 0;
				goto hvcurveto;
				case 0x1E:
				if (sp < 4) return 0;
				for (;;) {
					if (i + 3 >= sp) break;
					csctx_rccurve_to(c, 0, s[i], s[i + 1], s[i + 2], s[i + 3], (sp - i == 5) ? s[i + 4] : 0.0f);
					i += 4;
					hvcurveto:
					if (i + 3 >= sp) break;
					csctx_rccurve_to(c, s[i], 0, s[i + 1], s[i + 2], (sp - i == 5) ? s[i + 4] : 0.0f, s[i + 3]);
					i += 4;
				}
				break;
				case 0x08:
				if (sp < 6) return 0;
				for (; i + 5 < sp; i += 6)
				csctx_rccurve_to(c, s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5]);
				break;
				case 0x18:
				if (sp < 8) return 0;
				for (; i + 5 < sp - 2; i += 6)
				csctx_rccurve_to(c, s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5]);
				if (i + 1 >= sp) return 0;
				csctx_rline_to(c, s[i], s[i + 1]);
				break;
				case 0x19:
				if (sp < 8) return 0;
				for (; i + 1 < sp - 6; i += 2) csctx_rline_to(c, s[i], s[i + 1]);
				if (i + 5 >= sp) return 0;
				csctx_rccurve_to(c, s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5]);
				break;
				case 0x1A: case 0x1B:
				if (sp < 4) return 0;
				f = 0.0f;
				if (sp & 1) { f = s[i]; i++; }
				for (; i + 3 < sp; i += 4) {
					if (b0 == 0x1B) csctx_rccurve_to(c, s[i], f, s[i + 1], s[i + 2], s[i + 3], 0.0f);
					else csctx_rccurve_to(c, f, s[i], s[i + 1], s[i + 2], 0.0f, s[i + 3]);
					f = 0.0f;
				}
				break;
				case 0x0A:
				if (!has_subrs) {
					if (m_fdselect.size) subrs = cid_get_glyph_subrs(glyph_index);
					has_subrs = 1;
				}
				// fallthrough
				case 0x1D:
				if (sp < 1) return 0;
				v = (int)s[--sp];
				if (subr_stack_height >= 10) return 0;
				subr_stack[subr_stack_height++] = b;
				b = get_subr(b0 == 0x0A ? subrs : m_gsubrs, v);
				if (b.size == 0) return 0;
				b.cursor = 0;
				clear_stack = 0;
				break;
				case 0x0B:
				if (subr_stack_height <= 0) return 0;
				b = subr_stack[--subr_stack_height];
				clear_stack = 0;
				break;
				case 0x0E:
				csctx_close_shape(c);
				return 1;
				case 0x0C: {
					float dx1, dx2, dx3, dx4, dx5, dx6, dy1, dy2, dy3, dy4, dy5, dy6, dx, dy;
					switch (buf_get8(&b)) {
						case 0x22:
						if (sp < 7) return 0;
						dx1 = s[0]; dx2 = s[1]; dy2 = s[2]; dx3 = s[3]; dx4 = s[4]; dx5 = s[5]; dx6 = s[6];
						csctx_rccurve_to(c, dx1, 0, dx2, dy2, dx3, 0);
						csctx_rccurve_to(c, dx4, 0, dx5, -dy2, dx6, 0);
						break;
						case 0x23:
						if (sp < 13) return 0;
						csctx_rccurve_to(c, s[0], s[1], s[2], s[3], s[4], s[5]);
						csctx_rccurve_to(c, s[6], s[7], s[8], s[9], s[10], s[11]);
						break;
						case 0x24:
						if (sp < 9) return 0;
						dy1 = s[1]; dy2 = s[3]; dy5 = s[7];
						csctx_rccurve_to(c, s[0], dy1, s[2], dy2, s[4], 0);
						csctx_rccurve_to(c, s[5], 0, s[6], dy5, s[8], -(dy1 + dy2 + dy5));
						break;
						case 0x25:
						if (sp < 11) return 0;
						dx1 = s[0]; dy1 = s[1]; dx2 = s[2]; dy2 = s[3]; dx3 = s[4]; dy3 = s[5];
						dx4 = s[6]; dy4 = s[7]; dx5 = s[8]; dy5 = s[9]; dx6 = dy6 = s[10];
						dx = dx1 + dx2 + dx3 + dx4 + dx5;
						dy = dy1 + dy2 + dy3 + dy4 + dy5;
						if (std::fabs(dx) > std::fabs(dy)) dy6 = -dy; else dx6 = -dx;
						csctx_rccurve_to(c, dx1, dy1, dx2, dy2, dx3, dy3);
						csctx_rccurve_to(c, dx4, dy4, dx5, dy5, dx6, dy6);
						break;
						default:
						return 0;
					}
				} break;
				default:
				if (b0 != 255 && b0 != 28 && b0 < 32) return 0;
				if (b0 == 255) f = (float)(int32_t)buf_get(&b, 4) / 0x10000;
				else { buf_skip(&b, -1); f = (float)(int16_t)cff_int(&b); }
				if (sp >= 48) return 0;
				s[sp++] = f;
				clear_stack = 0;
				break;
			}
			if (clear_stack) sp = 0;
		}
		return 0;
	}
	int GetGlyphShapeT2(int glyph_index, Vertex** pvertices) {
		CSContext count_ctx = {}, out = {};
		count_ctx.bounds = 1;
		*pvertices = nullptr;
		if (run_charstring(glyph_index, &count_ctx)) {
			out.pvertices = *pvertices = (Vertex*)malloc(count_ctx.num_vertices * sizeof(Vertex));
			if (out.pvertices && run_charstring(glyph_index, &out)) return out.num_vertices;
			free(*pvertices);
			*pvertices = nullptr;
		}
		return 0;
	}
	Buf m_cff, m_charstrings, m_gsubrs, m_subrs, m_fontdicts, m_fdselect;
	#endif // FONT_NO_CFF
	// ---------------------------------------------------------------- TrueType outlines
	static int close_shape(Vertex* vertices, int n, int was_off, int start_off,
		int32_t sx, int32_t sy, int32_t scx, int32_t scy, int32_t cx, int32_t cy) {
		if (start_off) {
			if (was_off) setvertex(&vertices[n++], vcurve, (cx + scx) >> 1, (cy + scy) >> 1, cx, cy);
			setvertex(&vertices[n++], vcurve, sx, sy, scx, scy);
		} else if (was_off) setvertex(&vertices[n++], vcurve, sx, sy, cx, cy);
		else setvertex(&vertices[n++], vline, sx, sy, 0, 0);
		return n;
	}
	unsigned char* m_data = nullptr;
	int m_numGlyphs = 0;
	int m_loca = 0, m_head = 0, m_glyf = 0, m_hhea = 0, m_hmtx = 0, m_kern = 0;
	int m_index_map = 0;
	int m_indexToLocFormat = 0;
	float m_scale = 1.0f;
	bool m_loaded = false;
	// SVG 2 §10.2 face description (OS/2 + head), all in font units unless noted.
	int m_os2 = 0;
	int m_units_per_em = 1000;
	int m_x_height = 0, m_cap_height = 0;
	int m_weight_class = 400;
	bool m_italic = false, m_bold = false;
	int GetGlyfOffset(int glyph_index) {
		if (glyph_index >= m_numGlyphs || m_indexToLocFormat >= 2) return -1;
		int g1, g2;
		if (m_indexToLocFormat == 0) {
			g1 = m_glyf + ttUSHORT(m_data + m_loca + glyph_index * 2) * 2;
			g2 = m_glyf + ttUSHORT(m_data + m_loca + glyph_index * 2 + 2) * 2;
		} else {
			g1 = m_glyf + ttULONG(m_data + m_loca + glyph_index * 4);
			g2 = m_glyf + ttULONG(m_data + m_loca + glyph_index * 4 + 4);
		}
		return g1 == g2 ? -1 : g1;
	}
	int GetGlyphShapeTT(int glyph_index, Vertex** pvertices) {
		unsigned char* data = m_data;
		Vertex* vertices = nullptr;
		int num_vertices = 0;
		int g = GetGlyfOffset(glyph_index);
		*pvertices = nullptr;
		if (g < 0) return 0;
		int16_t numberOfContours = ttSHORT(data + g);
		if (numberOfContours > 0) {
			unsigned char flags = 0, flagcount = 0;
			int32_t i, j = 0, next_move = 0, was_off = 0, start_off = 0;
			int32_t x, y, cx = 0, cy = 0, sx = 0, sy = 0, scx = 0, scy = 0;
			unsigned char* endPts = data + g + 10;
			int32_t ins = ttUSHORT(endPts + numberOfContours * 2);
			unsigned char* points = endPts + numberOfContours * 2 + 2 + ins;
			int32_t n = 1 + ttUSHORT(endPts + numberOfContours * 2 - 2);
			int32_t m = n + 2 * numberOfContours;
			vertices = (Vertex*)malloc(m * sizeof(Vertex));
			if (!vertices) return 0;
			int32_t off = m - n;
			for (i = 0; i < n; ++i) {
				if (flagcount == 0) {
					flags = *points++;
					if (flags & 8) flagcount = *points++;
				} else --flagcount;
				vertices[off + i].type = flags;
			}
			// x then y coordinates (bit masks: short=2/4, same-or-positive=16/32)
			for (int pass = 0; pass < 2; ++pass) {
				int sh = pass ? 4 : 2, sm = pass ? 32 : 16;
				x = 0;
				for (i = 0; i < n; ++i) {
					flags = vertices[off + i].type;
					if (flags & sh) {
						int16_t d = *points++;
						x += (flags & sm) ? d : -d;
					} else if (!(flags & sm)) {
						x += (int16_t)(points[0] * 256 + points[1]);
						points += 2;
					}
					if (pass) vertices[off + i].y = (int16_t)x; else vertices[off + i].x = (int16_t)x;
				}
			}
			for (i = 0; i < n; ++i) {
				flags = vertices[off + i].type;
				x = vertices[off + i].x;
				y = vertices[off + i].y;
				if (next_move == i) {
					if (i != 0)
					num_vertices = close_shape(vertices, num_vertices, was_off, start_off, sx, sy, scx, scy, cx, cy);
					start_off = !(flags & 1);
					if (start_off) {
						scx = x; scy = y;
						if (!(vertices[off + i + 1].type & 1)) {
							sx = (x + (int32_t)vertices[off + i + 1].x) >> 1;
							sy = (y + (int32_t)vertices[off + i + 1].y) >> 1;
						} else {
							sx = vertices[off + i + 1].x;
							sy = vertices[off + i + 1].y;
							++i;
						}
					} else { sx = x; sy = y; }
					setvertex(&vertices[num_vertices++], vmove, sx, sy, 0, 0);
					was_off = 0;
					next_move = 1 + ttUSHORT(endPts + j * 2);
					++j;
				} else if (!(flags & 1)) {
					if (was_off) setvertex(&vertices[num_vertices++], vcurve, (cx + x) >> 1, (cy + y) >> 1, cx, cy);
					cx = x; cy = y;
					was_off = 1;
				} else {
					if (was_off) setvertex(&vertices[num_vertices++], vcurve, x, y, cx, cy);
					else setvertex(&vertices[num_vertices++], vline, x, y, 0, 0);
					was_off = 0;
				}
			}
			num_vertices = close_shape(vertices, num_vertices, was_off, start_off, sx, sy, scx, scy, cx, cy);
		} else if (numberOfContours < 0) {
			unsigned char* comp = data + g + 10;
			uint16_t flags;
			do {
				flags = ttUSHORT(comp); comp += 2;
				int gidx = ttUSHORT(comp); comp += 2;
				float mtx[6] = {1, 0, 0, 1, 0, 0};
				if (flags & 2) {
					if (flags & 1) {
						mtx[4] = ttSHORT(comp); mtx[5] = ttSHORT(comp + 2); comp += 4;
					} else {
						mtx[4] = (signed char)comp[0]; mtx[5] = (signed char)comp[1]; comp += 2;
					}
				}
				if (flags & (1 << 3)) {
					mtx[0] = mtx[3] = ttSHORT(comp) / 16384.0f; comp += 2;
					mtx[1] = mtx[2] = 0;
				} else if (flags & (1 << 6)) {
					mtx[0] = ttSHORT(comp) / 16384.0f;
					mtx[3] = ttSHORT(comp + 2) / 16384.0f; comp += 4;
					mtx[1] = mtx[2] = 0;
				} else if (flags & (1 << 7)) {
					mtx[0] = ttSHORT(comp) / 16384.0f;
					mtx[1] = ttSHORT(comp + 2) / 16384.0f;
					mtx[2] = ttSHORT(comp + 4) / 16384.0f;
					mtx[3] = ttSHORT(comp + 6) / 16384.0f; comp += 8;
				}
				float m = std::sqrt(mtx[0] * mtx[0] + mtx[1] * mtx[1]);
				float n = std::sqrt(mtx[2] * mtx[2] + mtx[3] * mtx[3]);
				Vertex* cv = nullptr;
				int cn = GetGlyphShape(gidx, &cv);
				if (cn > 0) {
					for (int i = 0; i < cn; ++i) {
						Vertex* v = &cv[i];
						float x = v->x, y = v->y;
						v->x = (int16_t)(m * (mtx[0] * x + mtx[2] * y + mtx[4]));
						v->y = (int16_t)(n * (mtx[1] * x + mtx[3] * y + mtx[5]));
						x = v->cx; y = v->cy;
						v->cx = (int16_t)(m * (mtx[0] * x + mtx[2] * y + mtx[4]));
						v->cy = (int16_t)(n * (mtx[1] * x + mtx[3] * y + mtx[5]));
					}
					Vertex* tmp = (Vertex*)realloc(vertices, (num_vertices + cn) * sizeof(Vertex));
					if (!tmp) { free(vertices); free(cv); return 0; }
					memcpy(tmp + num_vertices, cv, cn * sizeof(Vertex));
					vertices = tmp;
					num_vertices += cn;
				}
				free(cv);
			} while (flags & (1 << 5));
		}
		*pvertices = vertices;
		return num_vertices;
	}
	int GetGlyphShape(int glyph_index, Vertex** pvertices) {
		#ifndef FONT_NO_CFF
		if (m_cff.size) return GetGlyphShapeT2(glyph_index, pvertices);
		#endif
		return GetGlyphShapeTT(glyph_index, pvertices);
	}
	// ---------------------------------------------------------------- metrics
	void GetGlyphHMetrics(int glyph_index, int* advanceWidth, int* leftSideBearing) {
		int n = ttUSHORT(m_data + m_hhea + 34);
		const unsigned char* h = m_data + m_hmtx;
		if (glyph_index < n) {
			if (advanceWidth) *advanceWidth = ttSHORT(h + 4 * glyph_index);
			if (leftSideBearing) *leftSideBearing = ttSHORT(h + 4 * glyph_index + 2);
		} else {
			if (advanceWidth) *advanceWidth = ttSHORT(h + 4 * (n - 1));
			if (leftSideBearing) *leftSideBearing = ttSHORT(h + 4 * n + 2 * (glyph_index - n));
		}
	}
	// Kerning in font units between two glyph INDICES (format 0 'kern' table).
	int GetGlyphKernAdvance(int glyph1, int glyph2) {
		if (!m_kern) return 0;
		const unsigned char* data = m_data + m_kern;
		if (ttUSHORT(data + 2) < 1 || ttUSHORT(data + 8) != 1) return 0;
		int l = 0, r = ttUSHORT(data + 10) - 1;
		uint32_t needle = (uint32_t)glyph1 << 16 | glyph2;
		while (l <= r) {
			int m = (l + r) >> 1;
			uint32_t straw = ttULONG(data + 18 + m * 6);
			if (needle < straw) r = m - 1;
			else if (needle > straw) l = m + 1;
			else return ttSHORT(data + 22 + m * 6);
		}
		return 0;
	}
	static int decode_utf8_next(const char*& s) {
		unsigned c = (unsigned char)*s++;
		if (c < 0x80) return c;
		int n = c < 0xE0 ? 1 : c < 0xF0 ? 2 : 3;
		int cp = c & (0x3F >> n);
		while (n-- && *s) cp = cp << 6 | (*s++ & 0x3F);
		return cp;
	}
	// cmap lookup (uncached). Supports formats 4 and 12 (covers all modern Unicode fonts).
	int lookup_glyph_index(int codepoint) {
		const unsigned char* data = m_data;
		uint32_t index_map = m_index_map;
		uint16_t format = ttUSHORT(data + index_map);
		if (format == 4) {
			uint16_t segcount = ttUSHORT(data + index_map + 6) >> 1;
			uint16_t searchRange = ttUSHORT(data + index_map + 8) >> 1;
			uint16_t entrySelector = ttUSHORT(data + index_map + 10);
			uint16_t rangeShift = ttUSHORT(data + index_map + 12) >> 1;
			uint32_t endCount = index_map + 14, search = endCount;
			if (codepoint > 0xffff) return 0;
			if (codepoint >= ttUSHORT(data + search + rangeShift * 2)) search += rangeShift * 2;
			search -= 2;
			while (entrySelector) {
				searchRange >>= 1;
				if (codepoint > ttUSHORT(data + search + searchRange * 2)) search += searchRange * 2;
				--entrySelector;
			}
			search += 2;
			uint16_t item = (uint16_t)((search - endCount) >> 1);
			uint16_t start = ttUSHORT(data + index_map + 14 + segcount * 2 + 2 + 2 * item);
			uint16_t last = ttUSHORT(data + endCount + 2 * item);
			if (codepoint < start || codepoint > last) return 0;
			uint16_t offset = ttUSHORT(data + index_map + 14 + segcount * 6 + 2 + 2 * item);
			if (offset == 0)
			return (uint16_t)(codepoint + ttSHORT(data + index_map + 14 + segcount * 4 + 2 + 2 * item));
			return ttUSHORT(data + offset + (codepoint - start) * 2 + index_map + 14 + segcount * 6 + 2 + 2 * item);
		}
		if (format == 12) {
			int32_t low = 0, high = (int32_t)ttULONG(data + index_map + 12);
			while (low < high) {
				int32_t mid = low + ((high - low) >> 1);
				const unsigned char* grp = data + index_map + 16 + mid * 12;
				uint32_t sc = ttULONG(grp), ec = ttULONG(grp + 4);
				if ((uint32_t)codepoint < sc) high = mid;
				else if ((uint32_t)codepoint > ec) low = mid + 1;
				else return ttULONG(grp + 8) + codepoint - sc;
			}
		}
		return 0;
	}
	bool init(float pixel_height) {
		m_loaded = false;
		clear_cache();
		uint32_t cmap = find_table(m_data, 0, "cmap");
		m_loca = find_table(m_data, 0, "loca");
		m_head = find_table(m_data, 0, "head");
		m_glyf = find_table(m_data, 0, "glyf");
		m_hhea = find_table(m_data, 0, "hhea");
		m_hmtx = find_table(m_data, 0, "hmtx");
		m_kern = find_table(m_data, 0, "kern");
		if (!cmap || !m_head || !m_hhea || !m_hmtx) return false;
		// ---- SVG 2 §10.2: face weight / style / vertical baseline metrics ----
		m_units_per_em = ttUSHORT(m_data + m_head + 18);
		if (m_units_per_em == 0) m_units_per_em = 1000;
		const uint16_t mac_style = ttUSHORT(m_data + m_head + 44);
		m_weight_class = 400;
		m_bold = (mac_style & 1) != 0;
		m_italic = (mac_style & 2) != 0;
		m_x_height = m_cap_height = 0;
		uint32_t os2_len = 0;
		m_os2 = find_table(m_data, 0, "OS/2", &os2_len);
		if (m_os2 && os2_len >= 64) {
			const int w = ttUSHORT(m_data + m_os2 + 4);
			if (w >= 1 && w <= 1000) m_weight_class = w;
			const uint16_t sel = ttUSHORT(m_data + m_os2 + 62);
			if (sel & 0x0001) m_italic = true;
			if (sel & 0x0020) m_bold = true;
			if (os2_len >= 90) {                       // OS/2 v2+ carries sxHeight/sCapHeight
				m_x_height = ttSHORT(m_data + m_os2 + 86);
				m_cap_height = ttSHORT(m_data + m_os2 + 88);
			}
		}
		#ifndef FONT_NO_CFF
		m_cff = Buf();
		if (!m_glyf)
		#else
		if (!m_glyf || !m_loca) return false;
		if (0)
		#endif
		{
			#ifndef FONT_NO_CFF
			uint32_t cstype = 2, charstrings = 0, fdarrayoff = 0, fdselectoff = 0;
			uint32_t cff = find_table(m_data, 0, "CFF ");
			if (!cff) return false;
			m_fontdicts = Buf();
			m_fdselect = Buf();
			m_cff = new_buf(m_data + cff, 512 * 1024 * 1024);
			Buf b = m_cff;
			buf_skip(&b, 2);
			buf_seek(&b, buf_get8(&b));
			cff_get_index(&b);
			Buf topdictidx = cff_get_index(&b);
			Buf topdict = cff_index_get(topdictidx, 0);
			cff_get_index(&b);
			m_gsubrs = cff_get_index(&b);
			dict_get_ints(&topdict, 17, 1, &charstrings);
			dict_get_ints(&topdict, 0x100 | 6, 1, &cstype);
			dict_get_ints(&topdict, 0x100 | 36, 1, &fdarrayoff);
			dict_get_ints(&topdict, 0x100 | 37, 1, &fdselectoff);
			m_subrs = get_subrs(b, topdict);
			if (cstype != 2 || charstrings == 0) return false;
			if (fdarrayoff) {
				if (!fdselectoff) return false;
				buf_seek(&b, fdarrayoff);
				m_fontdicts = cff_get_index(&b);
				m_fdselect = buf_range(&b, fdselectoff, b.size - fdselectoff);
			}
			buf_seek(&b, charstrings);
			m_charstrings = cff_get_index(&b);
			#endif
		}
		#ifndef FONT_NO_CFF
		else if (!m_loca) return false;
		#endif
		uint32_t t = find_table(m_data, 0, "maxp");
		m_numGlyphs = t ? ttUSHORT(m_data + t + 4) : 0xffff;
		int numTables = ttUSHORT(m_data + cmap + 2);
		m_index_map = 0;
		for (int i = 0; i < numTables; ++i) {
			const unsigned char* rec = m_data + cmap + 4 + 8 * i;
			int pid = ttUSHORT(rec), eid = ttUSHORT(rec + 2);
			if ((pid == 3 && (eid == 1 || eid == 10)) || pid == 0)
			m_index_map = cmap + ttULONG(rec + 4);
		}
		if (!m_index_map) return false;
		m_indexToLocFormat = ttUSHORT(m_data + m_head + 50);
		set_pixel_height(pixel_height);
		return m_loaded = true;
	}
	public:
	Font() = default;
	Font(const Font&) = delete;
	Font& operator=(const Font&) = delete;
	~Font() { free(m_data); }
	bool load(const unsigned char* data, size_t size, float pixel_height) {
		free(m_data);
		m_data = (unsigned char*)malloc(size);
		if (!m_data) return false;
		memcpy(m_data, data, size);
		return init(pixel_height);
	}
	#ifndef FONT_NO_FILE
	bool load_file(const std::string& filename, float pixel_height) {
		FILE* f = fopen(filename.c_str(), "rb");
		if (!f) return false;
		fseek(f, 0, SEEK_END);
		long n = ftell(f);
		fseek(f, 0, SEEK_SET);
		free(m_data);
		m_data = n > 0 ? (unsigned char*)malloc(n) : nullptr;
		bool ok = m_data && fread(m_data, 1, n, f) == (size_t)n;
		fclose(f);
		return ok && init(pixel_height);
	}
	#endif
	// Cheap: the glyph cache is stored in font units, so it stays valid.
	// "Pixel height" is the ascent-descent span (stb_truetype convention).
	void set_pixel_height(float pixels) {
		if (!m_data || !m_hhea) return;
		const float span = (float)(ttSHORT(m_data + m_hhea + 4) - ttSHORT(m_data + m_hhea + 6));
		if (!(span > 0.0f)) return;
		m_scale = pixels / span;
	}
	float get_pixel_height() const {
		if (!m_data || !m_hhea) return 0.0f;
		return m_scale * (float)(ttSHORT(m_data + m_hhea + 4) - ttSHORT(m_data + m_hhea + 6));
	}
	bool is_loaded() const { return m_loaded; }
	int find_glyph_index(int codepoint) { return glyph(codepoint).index; }
	// ---- SVG 2 §10.2 face description -------------------------------------
	int units_per_em() const { return m_units_per_em > 0 ? m_units_per_em : 1000; }
	int weight_class() const { return m_weight_class; }   // OS/2 usWeightClass, 400 if absent
	bool is_italic() const { return m_italic; }           // fsSelection ITALIC / head macStyle
	bool is_bold() const { return m_bold; }
	// Uncached, by glyph index.
	bool get_glyph_box(int glyph_index, int* x0, int* y0, int* x1, int* y1) {
		#ifndef FONT_NO_CFF
		if (m_cff.size) {
			CSContext c = {};
			c.bounds = 1;
			int r = run_charstring(glyph_index, &c);
			if (x0) *x0 = r ? c.min_x : 0;
			if (y0) *y0 = r ? c.min_y : 0;
			if (x1) *x1 = r ? c.max_x : 0;
			if (y1) *y1 = r ? c.max_y : 0;
			return r != 0;
		}
		#endif
		int g = GetGlyfOffset(glyph_index);
		if (g < 0) return false;
		if (x0) *x0 = ttSHORT(m_data + g + 2);
		if (y0) *y0 = ttSHORT(m_data + g + 4);
		if (x1) *x1 = ttSHORT(m_data + g + 6);
		if (y1) *y1 = ttSHORT(m_data + g + 8);
		return true;
	}
	struct CharMetrics { float advance, lsb, x0, y0, x1, y1; };
	CharMetrics get_char_metrics(int codepoint) {
		CharMetrics m = {};
		Glyph& g = glyph(codepoint);
		ensure_box(g);
		m.advance = g.adv * m_scale;
		m.lsb = g.lsb * m_scale;
		if (g.box_ok) {
			m.x0 = g.x0 * m_scale; m.y0 = g.y0 * m_scale;
			m.x1 = g.x1 * m_scale; m.y1 = g.y1 * m_scale;
		}
		return m;
	}
	// Advance only (no bounding-box work) - used by the text layout engine.
	float get_char_advance(int codepoint) { return glyph(codepoint).adv * m_scale; }
	// Kerning between two CODEPOINTS, in pixels at the current pixel height.
	float get_kerning(int cp1, int cp2) {
		return GetGlyphKernAdvance(glyph(cp1).index, glyph(cp2).index) * m_scale;
	}
	void get_font_vmetrics(int* ascent, int* descent, int* lineGap) const {
		if (!m_data || !m_hhea) {
			if (ascent) *ascent = 0; if (descent) *descent = 0; if (lineGap) *lineGap = 0; return;
		}
		if (ascent) *ascent = ttSHORT(m_data + m_hhea + 4);
		if (descent) *descent = ttSHORT(m_data + m_hhea + 6);
		if (lineGap) *lineGap = ttSHORT(m_data + m_hhea + 8);
	}
	// Vertical metrics in pixels. x_height / cap_height fall back to 0.5em / 0.7em
	// when the face has no OS/2 v2 sxHeight / sCapHeight entries.
	struct VMetrics { float ascent, descent, line_gap, x_height, cap_height, em_size; };
	VMetrics get_vmetrics() const {
		VMetrics v = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
		if (!m_data || !m_hhea) return v;
		int a = 0, d = 0, lg = 0;
		get_font_vmetrics(&a, &d, &lg);
		const float em = (float)units_per_em();
		v.ascent = a * m_scale; v.descent = d * m_scale; v.line_gap = lg * m_scale;
		v.em_size = em * m_scale;
		v.x_height = (m_x_height > 0 ? (float)m_x_height : em * 0.5f) * m_scale;
		v.cap_height = (m_cap_height > 0 ? (float)m_cap_height : em * 0.7f) * m_scale;
		return v;
	}
	struct StringMetrics { float width, ascent, descent, line_gap; };
	StringMetrics get_string_metrics(const char* text) {
		int asc, desc, lg;
		get_font_vmetrics(&asc, &desc, &lg);
		StringMetrics sm = {0, asc * m_scale, desc * m_scale, lg * m_scale};
		int prev_gi = -1;
		int w = 0;                       // accumulate in font units, scale once
		while (*text) {
			const Glyph& g = glyph(decode_utf8_next(text));
			if (prev_gi >= 0) w += GetGlyphKernAdvance(prev_gi, g.index);
			w += g.adv;
			prev_gi = g.index;
		}
		sm.width = w * m_scale;
		return sm;
	}
	// Parses the outline once per codepoint; later calls just scale the cached vertices.
	Path2D get_char_path(int codepoint) {
		Path2D path;
		emit(path, outline(glyph(codepoint)), 0.0f);
		return path;
	}
	std::vector<Path2D> get_string_paths(const char* text) {
		std::vector<Path2D> paths;
		size_t count = 0;
		for (const char* p = text; *p; ++p) count += ((unsigned char)*p & 0xC0) != 0x80;
		paths.reserve(count);
		float x = 0;
		int prev_gi = -1;
		while (*text) {
			Glyph& g = glyph(decode_utf8_next(text));
			if (prev_gi >= 0) x += GetGlyphKernAdvance(prev_gi, g.index) * m_scale;
			paths.emplace_back();
			emit(paths.back(), outline(g), x);   // offset applied while emitting, no second pass
			x += g.adv * m_scale;
			prev_gi = g.index;
		}
		return paths;
	}
};
#endif