// ./canvas2d_text.cpp
#ifndef CANVAS2D_TEXT_CPP
#define CANVAS2D_TEXT_CPP
#include "canvas2d.hpp"
// ======================================================================
// SVG 2 §10 TEXT & TYPOGRAPHY
//
// Text stays 100% vector (§10.3): every glyph outline is baked into ONE
// Shape2D in USER space, so the existing fill/stroke engines, gradients,
// patterns, dashes, shadows, masks, clips, filters and Porter-Duff ops all
// apply to text exactly as they do to paths.
//
// Per-character placement transform (font space is y-up, canvas is y-down):
//   T = Translate(px,py) * Scale(lengthAdjust,1) * Rotate(rotate[i])
//       * Shear(-oblique) * Scale(font_scale, -font_scale)
//
// Layout order (SVG 2 §10.1 "text layout algorithm"):
//   kern -> dx/dy (cumulative) -> place glyph -> advance + letter-spacing
//   (+ word-spacing on spaces) -> textLength adjust -> anchor -> baseline.
//
// font-weight: best real face from the FontSet (OS/2 usWeightClass +
// fsSelection, slot names as fallback hints); any remaining weight delta is
// synthesised by emboldening (fill + stroke with the fill paint). Requesting
// a lighter weight than the face never thins it.
// font-style: real italic face when available, otherwise a 12-degree shear.
// ======================================================================
static constexpr float TXT_DEG2RAD = 0.01745329251994329577f;
static constexpr float TXT_OBLIQUE = 0.21256f;      // tan(12deg) synthetic oblique
static int txt_utf8_next(const char*& p) {
unsigned c = static_cast<unsigned char>(*p++);
if (c < 0x80) return static_cast<int>(c);
int n = c < 0xE0 ? 1 : (c < 0xF0 ? 2 : 3);
int cp = static_cast<int>(c & (0x3F >> n));
while (n-- && *p) cp = (cp << 6) | (*p++ & 0x3F);
return cp;
}
// CSS word-spacing applies to the word separator characters.
static bool txt_is_word_space(int cp) { return cp == 0x20 || cp == 0xA0; }
// dx/dy: missing entries are 0. rotate: the LAST entry repeats (SVG 2).
static float txt_list_at(const std::vector<float>& v, size_t i, bool repeat_last) {
if (v.empty()) return 0.0f;
if (i < v.size()) return v[i];
return repeat_last ? v.back() : 0.0f;
}
// Distance (in pixels, positive = downwards in canvas space) from the
// alphabetic baseline to the requested dominant baseline.
static float txt_baseline_offset(DominantBaseline b, const Font::VMetrics& v) {
switch (b) {
case DominantBaseline::Middle:        return v.x_height * 0.5f;
case DominantBaseline::Mathematical:  return v.x_height * 0.5f;
case DominantBaseline::Central:       return (v.ascent + v.descent) * 0.5f;
case DominantBaseline::Hanging:       return v.ascent * 0.8f;
case DominantBaseline::TextTop:
case DominantBaseline::TextBeforeEdge: return v.ascent;
case DominantBaseline::TextBottom:
case DominantBaseline::TextAfterEdge:  return v.descent;
default: return 0.0f;   // Auto / Alphabetic / Ideographic
}
}
// CSS-ish face matching: style mismatch dominates, then nearest weight.
static Font* txt_pick_face(Font* base, const FontSet& set, int weight, FontStyle style,
int& face_weight, bool& face_italic) {
Font* cand[4] = { set.regular ? set.regular : base, set.bold, set.italic, set.bold_italic };
const int slot_w[4] = {400, 700, 400, 700};
const bool slot_i[4] = {false, false, true, true};
const bool want_i = (style != FontStyle::Normal);
Font* best = nullptr; int best_score = 0x7FFFFFFF;
face_weight = 400; face_italic = false;
for (int i = 0; i < 4; ++i) {
Font* f = cand[i]; if (!f) continue;
int fw = f->weight_class();
if (fw == 400 && slot_w[i] == 700) fw = 700;     // slot hint when OS/2 is absent
const bool fi = f->is_italic() || slot_i[i];
const int score = std::abs(fw - weight) + ((fi == want_i) ? 0 : 1000);
if (score < best_score) { best = f; best_score = score; face_weight = fw; face_italic = fi; }
}
return best;
}
// ======================================================================
// LAYOUT
// ======================================================================
Canvas2D::TextRun Canvas2D::layout_text(const char* text, float x, float y, const TextStyle& st) const {
TextRun run;
if (!text || !*text) return run;
int fw = 400; bool fi = false;
Font* face = txt_pick_face(m_font, m_font_set, st.font_weight, st.font_style, fw, fi);
if (!face) return run;
// font_size is applied as a layout scale so the shared Font is never mutated.
float base_px = face->get_pixel_height();
if (!(base_px > 0.0f)) {
face->set_pixel_height(st.font_size > 0.0f ? st.font_size : 16.0f);
base_px = face->get_pixel_height();
if (!(base_px > 0.0f)) base_px = 16.0f;
}
const float k = (st.font_size > 0.0f) ? (st.font_size / base_px) : 1.0f;
const float px = base_px * k;
Font::VMetrics vm = face->get_vmetrics();
vm.ascent *= k; vm.descent *= k; vm.line_gap *= k;
vm.x_height *= k; vm.cap_height *= k; vm.em_size *= k;
run.face = face;
run.font_scale = k;
run.ascent = vm.ascent; run.descent = vm.descent;
run.x_height = vm.x_height; run.cap_height = vm.cap_height;
run.slant = (st.font_style != FontStyle::Normal && !fi) ? TXT_OBLIQUE : 0.0f;
const int dw = st.font_weight - fw;
run.bold = (dw > 0) ? std::min(0.06f, 0.0001f * static_cast<float>(dw)) * px : 0.0f;
std::vector<int> cps;
for (const char* p = text; *p;) cps.push_back(txt_utf8_next(p));
const size_t n = cps.size();
if (n == 0) return run;
run.glyphs.resize(n);
float cx = 0.0f, cy = 0.0f;
for (size_t i = 0; i < n; ++i) {
const int cp = cps[i];
if (i > 0) cx += face->get_kerning(cps[i - 1], cp) * k;
cx += txt_list_at(st.dx, i, false);
cy += txt_list_at(st.dy, i, false);
TextGlyph& g = run.glyphs[i];
g.cp = cp; g.x = cx; g.y = cy;
g.rot = txt_list_at(st.rotate, i, true) * TXT_DEG2RAD;
cx += face->get_char_advance(cp) * k + st.letter_spacing + (txt_is_word_space(cp) ? st.word_spacing : 0.0f);
}
float width = cx;
if (st.text_length == 0.0f) {
run.glyphs.clear(); width = 0.0f;                 // SVG: textLength="0" hides the text
} else if (st.text_length > 0.0f) {
if (st.length_adjust == LengthAdjust::SpacingAndGlyphs) {
if (width > 1e-6f) {
run.scale_x = st.text_length / width;
for (auto& g : run.glyphs) g.x *= run.scale_x;
width = st.text_length;
}
} else if (n > 1) {
const float extra = (st.text_length - width) / static_cast<float>(n - 1);
for (size_t i = 0; i < n; ++i) run.glyphs[i].x += extra * static_cast<float>(i);
width = st.text_length;
}
}
run.width = width;
float ax = 0.0f;
if (st.anchor == TextAnchor::Middle) ax = -width * 0.5f;
else if (st.anchor == TextAnchor::End) ax = -width;
run.x = x + ax;
run.y = y + txt_baseline_offset(st.baseline, vm);
for (auto& g : run.glyphs) { g.x += run.x; g.y += run.y; }
return run;
}
// ======================================================================
// GLYPH BAKING (user space)
// ======================================================================
Shape2D Canvas2D::build_text_shape(const TextRun& run) const {
Shape2D out;
if (!run.face) return out;
const float k = run.font_scale;
for (const TextGlyph& g : run.glyphs) {
Path2D gp = run.face->get_char_path(g.cp);
if (gp.commands.empty()) continue;
Transform t;
t.translate(g.x, g.y);
if (run.scale_x != 1.0f) t.scale(run.scale_x, 1.0f);
if (g.rot != 0.0f) t.rotate(g.rot);
if (run.slant != 0.0f) t.multiply(Transform(1.0f, 0.0f, -run.slant, 1.0f, 0.0f, 0.0f));
t.scale(k, -k);                                   // font y-up -> canvas y-down
for (Path2D::Command c : gp.commands) {
t.apply(c.x1, c.y1);
if (c.type == 2 || c.type == 3) t.apply(c.x2, c.y2);
if (c.type == 3) t.apply(c.x3, c.y3);
out.commands.push_back(c);
}
}
out.line_width = 1.0f;                            // legacy stroke_text width
if (run.bold > 0.0f) { out.line_cap = Shape2D::CAP_ROUND; out.line_join = Shape2D::JOIN_ROUND; }
return out;
}
// ======================================================================
// PUBLIC ENTRY POINTS
// ======================================================================
float Canvas2D::measure_text(const char* text, const TextStyle& st) const {
return layout_text(text, 0.0f, 0.0f, st).width;
}
Canvas2D::TextBox Canvas2D::text_box(const char* text, float x, float y, const TextStyle& st) const {
TextBox b{};
const TextRun run = layout_text(text, x, y, st);
if (!run.face) return b;
b.advance = run.width; b.baseline = run.y; b.glyphs = run.glyphs.size();
b.x0 = run.x; b.x1 = run.x + run.width;
b.y0 = run.y - run.ascent; b.y1 = run.y - run.descent;
return b;
}
Shape2D Canvas2D::text_path(const char* text, float x, float y, const TextStyle& st) const {
return build_text_shape(layout_text(text, x, y, st));
}
Canvas2D& Canvas2D::draw_text_run(const char* text, float x, float y, const TextStyle& st, bool do_fill, bool do_stroke) {
const TextRun run = layout_text(text, x, y, st);
if (run.glyphs.empty()) return *this;
Shape2D shape = build_text_shape(run);
if (shape.commands.empty()) return *this;
// Synthetic bold: fill + stroke the outline with the SAME paint. The context
// dash pattern must not leak into the emboldening pass (it would eat glyphs).
const bool embolden = do_fill && run.bold > 0.0f;
if (do_stroke) shape.line_width = 1.0f + run.bold;
else shape.line_width = embolden ? run.bold : 0.0f;
const bool stroke_pass = do_stroke || embolden;
Shape2D t = prepare_shape(shape, m_transform, stroke_pass, do_stroke, 16);
if (embolden && !do_stroke) {
const Paint saved = m_stroke_style;
m_stroke_style = m_fill_style;
emit(t, true, true);
m_stroke_style = saved;
} else {
emit(t, do_fill, do_stroke);
}
return *this;
}
Canvas2D& Canvas2D::fill_text(const char* text, float x, float y, const TextStyle& st) {
if (!m_fill_style.is_visible()) return *this;
return draw_text_run(text, x, y, st, true, false);
}
Canvas2D& Canvas2D::stroke_text(const char* text, float x, float y, const TextStyle& st) {
if (!m_stroke_style.is_visible()) return *this;
return draw_text_run(text, x, y, st, false, true);
}
#endif // CANVAS2D_TEXT_CPP