// ./canvas2d.hpp
#ifndef CANVAS2D_HPP
#define CANVAS2D_HPP
#include <cstdlib>
#include <cstring>
#include <vector>
#include "canvas2d_styles.hpp"
// ======================================================================
// 4. STATE STACK
// ======================================================================
enum class BlendMode {
Normal, Multiply, Screen, Overlay, Darken, Lighten,
ColorDodge, ColorBurn, HardLight, SoftLight, Difference, Exclusion,
Hue, Saturation, Color, Luminosity
};
enum class CompositeOp {
SourceOver, SourceIn, SourceOut, SourceAtop,
DestinationOver, DestinationIn, DestinationOut, DestinationAtop,
Clear, Copy
};
// SVG 2 §9.2 preserveAspectRatio = "<align> <meetOrSlice>".
// ImageAlign::None is SVG "none" (independent x/y stretch, the legacy
// draw_image behaviour and the default). ImageFit only applies when
// align != None: Meet letterboxes inside the viewport, Slice fills the
// viewport and crops the overflow (clipped in user space, so it follows
// the CTM).
enum class ImageAlign { None, xMinYMin, xMinYMid, xMinYMax, xMidYMin, xMidYMid, xMidYMax, xMaxYMin, xMaxYMid, xMaxYMax };
enum class ImageFit { Meet, Slice };
// Canvas2D imageSmoothingQuality:
//   Low    -> bilinear (premultiplied, fixed point; legacy default)
//   Medium -> bicubic Catmull-Rom (premultiplied, float)
//   High   -> exact box area-average when minifying, bicubic when magnifying
// imageSmoothingEnabled = false overrides quality with nearest neighbour.
enum class ImageSmoothingQuality { Low, Medium, High };
// ======================================================================
// SVG 2 §10 TEXT & TYPOGRAPHY
// ======================================================================
// text-anchor: alignment of the whole text chunk relative to the given x.
enum class TextAnchor { Start, Middle, End };
// dominant-baseline: which font baseline is placed on the given y.
//   Auto / Alphabetic / Ideographic -> alphabetic baseline (SVG default)
//   Middle       -> alphabetic + x-height/2
//   Central      -> midpoint of the ascent/descent (em) box
//   Hanging      -> ~0.8 * ascent (Devanagari-style hanging baseline)
//   TextTop / TextBeforeEdge  -> ascent
//   TextBottom / TextAfterEdge-> descent
//   Mathematical -> alphabetic + x-height/2 (math axis approximation)
enum class DominantBaseline {
Auto, Alphabetic, Ideographic, Middle, Central, Hanging,
TextTop, TextBottom, TextBeforeEdge, TextAfterEdge, Mathematical
};
// lengthAdjust: how textLength is honoured.
//   Spacing          -> distribute the delta over the inter-glyph gaps
//   SpacingAndGlyphs -> scale the glyphs (and advances) horizontally
enum class LengthAdjust { Spacing, SpacingAndGlyphs };
// font-style. Oblique selects the same faces as Italic; when no italic face
// is registered both are synthesised with a 12-degree shear.
enum class FontStyle { Normal, Italic, Oblique };
constexpr int FontWeightNormal = 400;
constexpr int FontWeightBold = 700;
// Optional real faces for font-weight / font-style matching. Anything left
// null falls back to Canvas2D::font(); missing weights are synthesised by
// emboldening (fill + stroke) and missing italics by an oblique shear.
struct FontSet {
Font* regular = nullptr; Font* bold = nullptr; Font* italic = nullptr; Font* bold_italic = nullptr;
bool empty() const { return !regular && !bold && !italic && !bold_italic; }
};
// Full SVG <text>/<tspan> typography state. Part of save()/restore().
// All lengths are USER-SPACE units (they follow the CTM), rotate is degrees.
struct TextStyle {
TextAnchor anchor = TextAnchor::Start;
DominantBaseline baseline = DominantBaseline::Auto;
FontStyle font_style = FontStyle::Normal;
int font_weight = FontWeightNormal;      // 1..1000 (400 normal, 700 bold)
float font_size = 0.0f;                  // <=0 -> the face's current pixel height
float letter_spacing = 0.0f;
float word_spacing = 0.0f;
float text_length = -1.0f;               // <0 unset, 0 suppresses rendering
LengthAdjust length_adjust = LengthAdjust::Spacing;
std::vector<float> dx, dy;               // cumulative per-character shifts
std::vector<float> rotate;               // per-character degrees, last repeats
};
struct CanvasState {
Transform transform; Paint fill_style; Paint stroke_style; FillRule fill_rule; Font* font; int stroke_curve_steps;
bool shadow_enabled; float shadow_dx, shadow_dy, shadow_blur; uint32_t shadow_color; BlendMode blend_mode; CompositeOp composite_op;
float global_alpha;
std::vector<float> line_dash; float line_dash_offset; Mask* mask; ClipPath* clip;
Marker* marker_start; Marker* marker_mid; Marker* marker_end; Filter* filter;
bool image_smoothing; ImageSmoothingQuality image_smoothing_quality;
TextStyle text_style; FontSet font_set;
};
// ======================================================================
// 5. CANVAS
// ======================================================================
class Canvas2D {
public:
Canvas2D(int w, int h)
: width(w), height(h), buffer(static_cast<uint32_t*>(std::calloc(static_cast<size_t>(w) * h, sizeof(uint32_t)))) {
m_tbuf = buffer; m_tw = w; m_th = h; m_tox = 0; m_toy = 0;
}
~Canvas2D() { std::free(buffer); }
Canvas2D(const Canvas2D&) = delete;
Canvas2D& operator=(const Canvas2D&) = delete;
uint32_t* get_buffer() const { return buffer; }
int get_width() const { return width; }
int get_height() const { return height; }
Canvas2D& save();
Canvas2D& restore();
Canvas2D& translate(float x, float y) { m_transform.translate(x, y); m_inv_dirty = true; return *this; }
Canvas2D& scale(float x, float y)     { m_transform.scale(x, y);     m_inv_dirty = true; return *this; }
Canvas2D& rotate(float angle)         { m_transform.rotate(angle);   m_inv_dirty = true; return *this; }
Canvas2D& skewX(float angle)          { m_transform.skew_x(angle);   m_inv_dirty = true; return *this; }
Canvas2D& skewY(float angle)          { m_transform.skew_y(angle);   m_inv_dirty = true; return *this; }
Canvas2D& transform(float a, float b, float c, float d, float e, float f) { m_transform.transform(a, b, c, d, e, f); m_inv_dirty = true; return *this; }
Canvas2D& setTransform(float a, float b, float c, float d, float e, float f) { m_transform.set_transform(a, b, c, d, e, f); m_inv_dirty = true; return *this; }
Canvas2D& resetTransform() { m_transform.reset(); m_inv_dirty = true; return *this; }
const Transform& get_transform() const { return m_transform; }
Canvas2D& fill_style(uint32_t color) { m_fill_style = Paint(color); return *this; }
Canvas2D& fill_style(Gradient* grad) { if (grad) grad->prepare(); m_fill_style = Paint(grad); return *this; }
Canvas2D& fill_style(Pattern* pat) { m_fill_style = Paint(pat); return *this; }
Canvas2D& stroke_style(uint32_t color) { m_stroke_style = Paint(color); return *this; }
Canvas2D& stroke_style(Gradient* grad) { if (grad) grad->prepare(); m_stroke_style = Paint(grad); return *this; }
Canvas2D& stroke_style(Pattern* pat) { m_stroke_style = Paint(pat); return *this; }
Canvas2D& fill_rule(FillRule rule) { m_fill_rule = rule; return *this; }
FillRule fill_rule() const { return m_fill_rule; }
Canvas2D& font(Font* f) { m_font = f; return *this; }
Font* font() const { return m_font; }
// ----------------------------------------------------------------------
// SVG 2 §10.2 font family (weight / style variants)
// Registering a set also makes its regular face the current font().
// ----------------------------------------------------------------------
Canvas2D& font_set(const FontSet& fs) { m_font_set = fs; if (fs.regular) m_font = fs.regular; return *this; }
const FontSet& font_set() const { return m_font_set; }
Canvas2D& font_variants(Font* regular, Font* bold, Font* italic, Font* bold_italic) {
m_font_set = FontSet{regular, bold, italic, bold_italic};
if (regular) m_font = regular;
return *this;
}
Canvas2D& clear_font_variants() { m_font_set = FontSet(); return *this; }
// ----------------------------------------------------------------------
// SVG 2 §10.1 / §10.2 typography state (all of it saved/restored)
// ----------------------------------------------------------------------
Canvas2D& text_style(const TextStyle& s) { m_text_style = s; return *this; }
TextStyle& text_style() { return m_text_style; }
const TextStyle& text_style() const { return m_text_style; }
Canvas2D& reset_text_style() { m_text_style = TextStyle(); return *this; }
Canvas2D& text_anchor(TextAnchor a) { m_text_style.anchor = a; return *this; }
TextAnchor text_anchor() const { return m_text_style.anchor; }
Canvas2D& dominant_baseline(DominantBaseline b) { m_text_style.baseline = b; return *this; }
DominantBaseline dominant_baseline() const { return m_text_style.baseline; }
Canvas2D& font_weight(int w) { m_text_style.font_weight = w < 1 ? 1 : (w > 1000 ? 1000 : w); return *this; }
int font_weight() const { return m_text_style.font_weight; }
Canvas2D& font_style(FontStyle s) { m_text_style.font_style = s; return *this; }
FontStyle font_style() const { return m_text_style.font_style; }
// font_size never mutates the Font: the layout scales the cached outlines.
Canvas2D& font_size(float px) { m_text_style.font_size = (px > 0.0f) ? px : 0.0f; return *this; }
float font_size() const { return m_text_style.font_size; }
Canvas2D& letter_spacing(float v) { m_text_style.letter_spacing = v; return *this; }
float letter_spacing() const { return m_text_style.letter_spacing; }
Canvas2D& word_spacing(float v) { m_text_style.word_spacing = v; return *this; }
float word_spacing() const { return m_text_style.word_spacing; }
Canvas2D& text_length(float len) { m_text_style.text_length = len; return *this; }
float text_length() const { return m_text_style.text_length; }
Canvas2D& clear_text_length() { m_text_style.text_length = -1.0f; return *this; }
Canvas2D& length_adjust(LengthAdjust a) { m_text_style.length_adjust = a; return *this; }
LengthAdjust length_adjust() const { return m_text_style.length_adjust; }
Canvas2D& text_dx(const float* v, size_t n) { m_text_style.dx.clear(); if (v && n) m_text_style.dx.assign(v, v + n); return *this; }
Canvas2D& text_dx(const std::vector<float>& v) { m_text_style.dx = v; return *this; }
Canvas2D& text_dx(std::initializer_list<float> v) { m_text_style.dx.assign(v.begin(), v.end()); return *this; }
const std::vector<float>& text_dx() const { return m_text_style.dx; }
Canvas2D& text_dy(const float* v, size_t n) { m_text_style.dy.clear(); if (v && n) m_text_style.dy.assign(v, v + n); return *this; }
Canvas2D& text_dy(const std::vector<float>& v) { m_text_style.dy = v; return *this; }
Canvas2D& text_dy(std::initializer_list<float> v) { m_text_style.dy.assign(v.begin(), v.end()); return *this; }
const std::vector<float>& text_dy() const { return m_text_style.dy; }
Canvas2D& text_rotate(const float* v, size_t n) { m_text_style.rotate.clear(); if (v && n) m_text_style.rotate.assign(v, v + n); return *this; }
Canvas2D& text_rotate(const std::vector<float>& v) { m_text_style.rotate = v; return *this; }
Canvas2D& text_rotate(std::initializer_list<float> v) { m_text_style.rotate.assign(v.begin(), v.end()); return *this; }
const std::vector<float>& text_rotate() const { return m_text_style.rotate; }
Canvas2D& clear_text_offsets() { m_text_style.dx.clear(); m_text_style.dy.clear(); m_text_style.rotate.clear(); return *this; }
Canvas2D& drop_shadow(float dx, float dy, float blur, uint32_t color) {
m_shadow_enabled = true; m_shadow_dx = dx; m_shadow_dy = dy; m_shadow_blur = blur; m_shadow_color = color; return *this;
}
Canvas2D& clear_shadow() { m_shadow_enabled = false; return *this; }
Canvas2D& stroke_curve_steps(int steps) { m_stroke_curve_steps = steps < 4 ? 4 : steps; return *this; }
Canvas2D& blend_mode(BlendMode mode) { m_blend_mode = mode; return *this; }
BlendMode blend_mode() const { return m_blend_mode; }
Canvas2D& composite_op(CompositeOp op) { m_composite_op = op; return *this; }
CompositeOp composite_op() const { return m_composite_op; }
Canvas2D& global_composite_operation(CompositeOp op) { return composite_op(op); }
CompositeOp global_composite_operation() const { return m_composite_op; }
// ----------------------------------------------------------------------
// globalAlpha (part of save()/restore()). Multiplies the SOURCE alpha of
// every draw (fill, stroke, dash, gradient, pattern, image, text, shadow)
// after coverage/paint alpha, alongside masks/clips, and BEFORE the
// composite operator. Mask CONTENT renders at alpha 1 (independent pass);
// clear() is a raw buffer reset and ignores it, like HTML clearRect.
// Per the HTML spec, invalid values (NaN, infinity, outside [0,1]) are
// ignored and leave the current value unchanged.
// ----------------------------------------------------------------------
Canvas2D& global_alpha(float alpha) {
if (std::isfinite(alpha) && alpha >= 0.0f && alpha <= 1.0f) m_global_alpha = alpha;
return *this;
}
float global_alpha() const { return m_global_alpha; }
Canvas2D& globalAlpha(float alpha) { return global_alpha(alpha); }
float globalAlpha() const { return m_global_alpha; }
Canvas2D& set_mask(Mask* m) { m_mask = m; return *this; }
Canvas2D& clear_mask() { m_mask = nullptr; return *this; }
Mask* get_mask() const { return m_mask; }
Canvas2D& set_clip(ClipPath* c) { m_clip = c; return *this; }
Canvas2D& clear_clip() { m_clip = nullptr; return *this; }
ClipPath* get_clip() const { return m_clip; }
Canvas2D& set_filter(Filter* f) { m_filter = f; return *this; }
Canvas2D& clear_filter() { m_filter = nullptr; return *this; }
Filter* get_filter() const { return m_filter; }
Canvas2D& apply_filter(const Filter& f);
Canvas2D& apply_filter(const Filter& f, float x, float y, float w, float h);
Canvas2D& set_marker_start(Marker* m) { m_marker_start = m; return *this; }
Canvas2D& set_marker_mid(Marker* m) { m_marker_mid = m; return *this; }
Canvas2D& set_marker_end(Marker* m) { m_marker_end = m; return *this; }
Canvas2D& set_markers(Marker* start, Marker* mid, Marker* end) {
m_marker_start = start; m_marker_mid = mid; m_marker_end = end; return *this;
}
Canvas2D& set_marker(Marker* m) { return set_markers(m, m, m); }
Canvas2D& clear_markers() { return set_markers(nullptr, nullptr, nullptr); }
Marker* marker_start() const { return m_marker_start; }
Marker* marker_mid() const { return m_marker_mid; }
Marker* marker_end() const { return m_marker_end; }
Canvas2D& set_line_dash(const float* segments, size_t count) {
m_line_dash.clear(); if (segments && count) m_line_dash.assign(segments, segments + count); return *this;
}
Canvas2D& set_line_dash(const std::vector<float>& segments) { m_line_dash = segments; return *this; }
Canvas2D& set_line_dash(std::initializer_list<float> segments) { m_line_dash.assign(segments.begin(), segments.end()); return *this; }
const std::vector<float>& get_line_dash() const { return m_line_dash; }
Canvas2D& line_dash_offset(float offset) { m_line_dash_offset = offset; return *this; }
float line_dash_offset() const { return m_line_dash_offset; }
Canvas2D& setLineDash(std::initializer_list<float> segments) { return set_line_dash(segments); }
Canvas2D& setLineDash(const float* segments, size_t count) { return set_line_dash(segments, count); }
const std::vector<float>& getLineDash() const { return m_line_dash; }
Canvas2D& lineDashOffset(float offset) { return line_dash_offset(offset); }
// SVG 2 §9.2 image sampling state (part of save()/restore()).
Canvas2D& image_smoothing_enabled(bool enabled) { m_image_smoothing = enabled; return *this; }
bool image_smoothing_enabled() const { return m_image_smoothing; }
Canvas2D& image_smoothing_quality(ImageSmoothingQuality quality) { m_image_smoothing_quality = quality; return *this; }
ImageSmoothingQuality image_smoothing_quality() const { return m_image_smoothing_quality; }
Canvas2D& imageSmoothingEnabled(bool enabled) { return image_smoothing_enabled(enabled); }
bool imageSmoothingEnabled() const { return m_image_smoothing; }
Canvas2D& imageSmoothingQuality(ImageSmoothingQuality quality) { return image_smoothing_quality(quality); }
ImageSmoothingQuality imageSmoothingQuality() const { return m_image_smoothing_quality; }
Canvas2D& clear(uint32_t color) { std::fill(buffer, buffer + static_cast<size_t>(width) * height, color); return *this; }
Canvas2D& fill_solid(uint32_t color) { return clear(color); }
// ----------------------------------------------------------------------
// SVG 2 §10 text API. The 3-argument forms use the current text_style();
// the 4-argument forms are one-shot overrides that leave the state alone.
// ----------------------------------------------------------------------
struct TextBox { float x0 = 0, y0 = 0, x1 = 0, y1 = 0, advance = 0, baseline = 0; size_t glyphs = 0; };
float measure_text(const char* text) const { return measure_text(text, m_text_style); }
float measure_text(const char* text, const TextStyle& style) const;
TextBox text_box(const char* text, float x, float y) const { return text_box(text, x, y, m_text_style); }
TextBox text_box(const char* text, float x, float y, const TextStyle& style) const;
Shape2D text_path(const char* text, float x, float y) const { return text_path(text, x, y, m_text_style); }
Shape2D text_path(const char* text, float x, float y, const TextStyle& style) const;
Canvas2D& fill_text(const char* text, float x, float y) { return fill_text(text, x, y, m_text_style); }
Canvas2D& fill_text(const char* text, float x, float y, const TextStyle& style);
Canvas2D& stroke_text(const char* text, float x, float y) { return stroke_text(text, x, y, m_text_style); }
Canvas2D& stroke_text(const char* text, float x, float y, const TextStyle& style);
Canvas2D& path(const Shape2D& shape) {
const bool do_fill = m_fill_style.is_visible();
const bool do_stroke = m_stroke_style.is_visible() && shape.line_width > 0.0f;
const bool do_markers = m_marker_start || m_marker_mid || m_marker_end;
if (!do_fill && !do_stroke && !do_markers) return *this;
if (do_fill || do_stroke) {
Shape2D t = prepare_shape(shape, m_transform, do_stroke, true);
emit(t, do_fill, do_stroke);
}
if (do_markers) draw_markers(shape);
return *this;
}
Canvas2D& draw_image(const Image& img, float x, float y);
Canvas2D& draw_image(const Image& img, float x, float y, float w, float h,
ImageAlign align = ImageAlign::None, ImageFit fit = ImageFit::Meet);
Canvas2D& draw_pixels(const uint32_t* pixels, int pw, int ph, float x, float y, float w, float h,
ImageAlign align = ImageAlign::None, ImageFit fit = ImageFit::Meet) {
return draw_pixels(reinterpret_cast<const uint8_t*>(pixels), pw, ph, 4, x, y, w, h, align, fit);
}
Canvas2D& draw_pixels(const uint8_t* src, int iw, int ih, int ch, float x, float y, float w, float h,
ImageAlign align = ImageAlign::None, ImageFit fit = ImageFit::Meet);
Canvas2D& draw_shape(const Shape2D& shape, const Paint& fill_paint, const Paint& stroke_paint,
float offset_x = 0.0f, float offset_y = 0.0f, float scale_x = 1.0f, float scale_y = 1.0f);
private:
int width, height; uint32_t* buffer;
Paint m_fill_style = Paint(rgba(0, 0, 0, 255)); Paint m_stroke_style = Paint(rgba(0, 0, 0, 255));
FillRule m_fill_rule = FillRule::NonZero; Font* m_font = nullptr; int m_stroke_curve_steps = 200;
bool m_shadow_enabled = false; float m_shadow_dx = 0.0f, m_shadow_dy = 0.0f, m_shadow_blur = 0.0f; uint32_t m_shadow_color = rgba(0, 0, 0, 128);
BlendMode m_blend_mode = BlendMode::Normal; CompositeOp m_composite_op = CompositeOp::SourceOver;
float m_global_alpha = 1.0f;
std::vector<float> m_line_dash; float m_line_dash_offset = 0.0f;
bool m_image_smoothing = true; ImageSmoothingQuality m_image_smoothing_quality = ImageSmoothingQuality::Low;
TextStyle m_text_style; FontSet m_font_set;
Mask* m_mask = nullptr; ClipPath* m_clip = nullptr; Filter* m_filter = nullptr;
Marker* m_marker_start = nullptr; Marker* m_marker_mid = nullptr; Marker* m_marker_end = nullptr;
uint32_t* m_tbuf; int m_tw, m_th, m_tox, m_toy;
Transform m_transform, m_inv_transform; bool m_inv_dirty = true;
std::vector<CanvasState> m_state_stack;
static constexpr int AA_SUB = 16; static constexpr int CLIP_MAX_DEPTH = 8;
struct Edge { float y_min, y_max, x_at_ymin, inv_slope; int dir; };
struct ActiveEdge { float y_max, x, dx; int dir; };
std::vector<Edge> m_edges; std::vector<ActiveEdge> m_active;
std::vector<float> m_partial, m_delta; std::vector<uint32_t> m_shadow_buf;
std::vector<uint8_t> m_blur_a, m_blur_b; std::vector<uint32_t> m_blur_col, m_blur_recip;
std::vector<uint32_t> m_layer, m_mask_buf; std::vector<uint8_t> m_clip_cov, m_clip_tmp;
Shape2D m_marker_clip_shape; ClipPath m_marker_clip;
friend class Filter;
bool filtered() const { return m_filter && !m_filter->empty(); }
const Transform& inv() {
if (m_inv_dirty) { m_inv_transform = m_transform.inverse(); m_inv_dirty = false; }
return m_inv_transform;
}
// Note: 'inline' removed to allow definition in canvas2d_raster.cpp while being called across multiple translation units
static uint8_t blend_channel(float b, float s, BlendMode mode);
static void rgb_to_hsl(float r, float g, float b, float& h, float& s, float& l);
static void hsl_to_rgb(float h, float s, float l, float& r, float& g, float& b);
static uint32_t blend_core(uint32_t bg, uint32_t fg, uint32_t fa, BlendMode mode);
static uint32_t blendColors(uint32_t bg, uint32_t fg, float coverage, BlendMode mode = BlendMode::Normal);
static uint32_t composite_core(uint32_t bg, uint32_t fg, uint32_t fa, BlendMode mode, CompositeOp op);
void composite_op_buffer(const uint32_t* src, int sw, int sh, int off_x, int off_y, CompositeOp op, BlendMode mode);
void set_target(uint32_t* buf, int w, int h, int ox, int oy) { m_tbuf = buf; m_tw = w; m_th = h; m_tox = ox; m_toy = oy; }
void reset_target() { m_tbuf = buffer; m_tw = width; m_th = height; m_tox = 0; m_toy = 0; }
inline void add_edge(float x1, float y1, float x2, float y2, int dir) {
if (y1 == y2) return;
if (y1 > y2) { std::swap(x1, x2); std::swap(y1, y2); dir = -dir; }
if (y2 <= static_cast<float>(m_toy) || y1 >= static_cast<float>(m_toy + m_th)) return;
m_edges.push_back({y1, y2, x1, (x2 - x1) / (y2 - y1), dir});
}
template <class RowFn> void raster_scanlines(bool even_odd, RowFn&& emit_row);
void raster_edges(const Paint& paint, bool even_odd, float obj_x = 0.0f, float obj_y = 0.0f, float obj_w = 1.0f, float obj_h = 1.0f);
void raster_coverage(uint8_t* cov, bool even_odd);
void box_blur(uint32_t* buf, int w, int h, int radius);
void composite_buffer(const uint32_t* src, int sw, int sh, int off_x, int off_y);
static void raw_extent(const Shape2D& s, float& x0, float& y0, float& x1, float& y1);
void draw_with_shadow(const Shape2D& shape, bool do_fill, bool do_stroke);
Shape2D prepare_shape(const Shape2D& shape, const Transform& T, bool do_stroke, bool context_dash = true, int curve_steps = -1) const;
void paint_shape(const Shape2D& t, bool do_fill, bool do_stroke);
void emit(const Shape2D& t, bool do_fill, bool do_stroke);
void shape_bounds(const Shape2D& s, float ox, float oy, float sx, float sy, float db[4], float ub[4]) const;
// SVG 2 §9.2: maps (viewport, source size, align, fit) to the content rect in
// user space. align == None returns the viewport unchanged (legacy stretch,
// negative w/h keep flipping). clip_viewport is true for Slice.
static void image_fit_rect(float x, float y, float w, float h, float iw, float ih,
ImageAlign align, ImageFit fit, float rect[4], bool& clip_viewport);
void image_bounds(float x, float y, float w, float h, float db[4], float ub[4],
ImageAlign align = ImageAlign::None, ImageFit fit = ImageFit::Meet, float iw = 0.0f, float ih = 0.0f) const;
void filter_device_bounds(const Filter& f, const float ub[4], float b[4]) const;
template <class F> void draw_layered(const float db[4], const float ub[4], F&& draw_fn);
void render_mask_content(Mask* mk, int bx0, int by0, int bw, int bh, const float ub[4]);
void clip_device_bounds(const ClipPath* cp, const float ub[4], float b[4], int depth = 0) const;
void clip_union(ClipPath* cp, int bx0, int by0, int bw, int bh, const float ub[4], uint8_t* out, int depth);
void draw_shape_impl(const Shape2D& shape, const Paint& fill_paint, const Paint& stroke_paint, float offset_x, float offset_y, float scale_x, float scale_y);
void draw_pixels_impl(const uint8_t* src, int iw, int ih, int ch, float x, float y, float w, float h,
ImageAlign align = ImageAlign::None, ImageFit fit = ImageFit::Meet);
struct MarkerSlot { float x, y, in_x, in_y, out_x, out_y; bool has_in, has_out; int end_kind; };
void marker_slots(const Shape2D& shape, std::vector<MarkerSlot>& out) const;
void draw_marker(const Marker& mk, const MarkerSlot& s, bool is_start, float stroke_width);
void draw_markers(const Shape2D& shape);
// ---- SVG 2 §10 layout engine (canvas2d_text.cpp) ----------------------
struct TextGlyph { int cp = 0; float x = 0, y = 0, rot = 0; };
struct TextRun {
Font* face = nullptr; std::vector<TextGlyph> glyphs;
float x = 0, y = 0, width = 0;        // anchored origin + baseline (user space)
float scale_x = 1, font_scale = 1, slant = 0, bold = 0;
float ascent = 0, descent = 0, x_height = 0, cap_height = 0;
};
TextRun layout_text(const char* text, float x, float y, const TextStyle& style) const;
Shape2D build_text_shape(const TextRun& run) const;
Canvas2D& draw_text_run(const char* text, float x, float y, const TextStyle& style, bool do_fill, bool do_stroke);
};
inline Mask& Mask::add(const Canvas2D& c, float x, float y, float w, float h) {
return add_pixels(c.get_buffer(), c.get_width(), c.get_height(), x, y,
w != 0.0f ? w : static_cast<float>(c.get_width()),
h != 0.0f ? h : static_cast<float>(c.get_height()));
}
inline Pattern& Pattern::add(const Canvas2D& c, float ix, float iy, float iw, float ih) {
return add(c.get_buffer(), c.get_width(), c.get_height(), ix, iy,
iw != 0.0f ? iw : static_cast<float>(c.get_width()),
ih != 0.0f ? ih : static_cast<float>(c.get_height()));
}
#include "font2d.hpp"
#endif // CANVAS2D_HPP