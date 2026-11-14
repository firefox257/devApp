// ./canvas2d_raster.cpp
#ifndef CANVAS2D_RASTER_CPP
#define CANVAS2D_RASTER_CPP
#include "canvas2d.hpp"
// ======================================================================
// BLENDING
// ======================================================================
uint8_t Canvas2D::blend_channel(float b, float s, BlendMode mode) {
float r;
switch (mode) {
case BlendMode::Multiply: r = b * s; break;
case BlendMode::Screen: r = 1.0f - (1.0f - b) * (1.0f - s); break;
case BlendMode::Overlay: r = (b < 0.5f) ? (2.0f * b * s) : (1.0f - 2.0f * (1.0f - b) * (1.0f - s)); break;
case BlendMode::Darken: r = std::min(b, s); break;
case BlendMode::Lighten: r = std::max(b, s); break;
case BlendMode::ColorDodge: r = (b == 0.0f) ? 0.0f : ((s == 1.0f) ? 1.0f : std::min(1.0f, b / (1.0f - s))); break;
case BlendMode::ColorBurn: r = (b == 1.0f) ? 1.0f : ((s == 0.0f) ? 0.0f : std::max(0.0f, 1.0f - (1.0f - b) / s)); break;
case BlendMode::HardLight: r = (s < 0.5f) ? (2.0f * b * s) : (1.0f - 2.0f * (1.0f - b) * (1.0f - s)); break;
case BlendMode::SoftLight: {
const float d = (b <= 0.25f) ? ((16.0f * b - 12.0f) * b + 4.0f) * b : std::sqrt(b);
r = (s < 0.5f) ? (b - (1.0f - 2.0f * s) * b * (1.0f - b)) : (b + (2.0f * s - 1.0f) * (d - b)); break;
}
case BlendMode::Difference: r = std::fabs(b - s); break;
case BlendMode::Exclusion: r = b + s - 2.0f * b * s; break;
default: r = s; break;
}
return static_cast<uint8_t>(r * 255.0f + 0.5f);
}
void Canvas2D::rgb_to_hsl(float r, float g, float b, float& h, float& s, float& l) {
const float mx = std::max(r, std::max(g, b)), mn = std::min(r, std::min(g, b));
l = (mx + mn) * 0.5f;
if (mx == mn) { h = s = 0.0f; return; }
const float d = mx - mn;
s = l > 0.5f ? d / (2.0f - mx - mn) : d / (mx + mn);
if (mx == r) h = (g - b) / d + (g < b ? 6.0f : 0.0f);
else if (mx == g) h = (b - r) / d + 2.0f;
else h = (r - g) / d + 4.0f;
h /= 6.0f;
}
void Canvas2D::hsl_to_rgb(float h, float s, float l, float& r, float& g, float& b) {
if (s == 0.0f) { r = g = b = l; return; }
auto hue2rgb = [](float p, float q, float t) {
if (t < 0.0f) t += 1.0f; if (t > 1.0f) t -= 1.0f;
if (t < 1.0f / 6.0f) return p + (q - p) * 6.0f * t;
if (t < 0.5f) return q;
if (t < 2.0f / 3.0f) return p + (q - p) * (2.0f / 3.0f - t) * 6.0f;
return p;
};
const float q = l < 0.5f ? l * (1.0f + s) : l + s - l * s, p = 2.0f * l - q;
r = hue2rgb(p, q, h + 1.0f / 3.0f);
g = hue2rgb(p, q, h);
b = hue2rgb(p, q, h - 1.0f / 3.0f);
}
uint32_t Canvas2D::blend_core(uint32_t bg, uint32_t fg, uint32_t fa, BlendMode mode) {
if (fa == 0) return bg;
const uint32_t a_bg = bg >> 24;
if (mode == BlendMode::Normal) {
if (fa == 255) return fg | 0xFF000000u;
if (a_bg == 0) return (fa << 24) | (fg & 0x00FFFFFFu);
if (a_bg == 255) {
const uint32_t ia = 255 - fa;
uint32_t rb = (fg & 0x00FF00FFu) * fa + (bg & 0x00FF00FFu) * ia + 0x00800080u;
rb = ((rb + ((rb >> 8) & 0x00FF00FFu)) >> 8) & 0x00FF00FFu;
uint32_t g = ((fg >> 8) & 0xFFu) * fa + ((bg >> 8) & 0xFFu) * ia + 128u;
g = ((g + (g >> 8)) >> 8) & 0xFFu;
return 0xFF000000u | rb | (g << 8);
}
}
const uint32_t r_bg = bg & 0xFF, g_bg = (bg >> 8) & 0xFF, b_bg = (bg >> 16) & 0xFF;
float r = (fg & 0xFF) * (1.0f / 255.0f), g = ((fg >> 8) & 0xFF) * (1.0f / 255.0f), b = ((fg >> 16) & 0xFF) * (1.0f / 255.0f);
if (mode != BlendMode::Normal) {
if (mode >= BlendMode::Hue) {
float hf, sf, lf, hb, sb, lb;
rgb_to_hsl(r, g, b, hf, sf, lf);
rgb_to_hsl(r_bg / 255.0f, g_bg / 255.0f, b_bg / 255.0f, hb, sb, lb);
switch (mode) {
case BlendMode::Hue: lf = lb; sf = sb; break;
case BlendMode::Saturation: lf = lb; hf = hb; break;
case BlendMode::Color: lf = lb; break;
default: hf = hb; sf = sb; break;
}
hsl_to_rgb(hf, sf, lf, r, g, b);
} else {
r = blend_channel(r_bg / 255.0f, r, mode) / 255.0f;
g = blend_channel(g_bg / 255.0f, g, mode) / 255.0f;
b = blend_channel(b_bg / 255.0f, b, mode) / 255.0f;
}
}
if (a_bg == 255 && fa == 255)
return 0xFF000000u | (static_cast<uint32_t>(b * 255.0f + 0.5f) << 16) | (static_cast<uint32_t>(g * 255.0f + 0.5f) << 8) | static_cast<uint32_t>(r * 255.0f + 0.5f);
const float f_fa = fa * (1.0f / 255.0f), f_bgA = a_bg * (1.0f / 255.0f), inv_fa = 1.0f - f_fa;
uint32_t outA = fa + static_cast<uint32_t>(a_bg * inv_fa);
if (outA == 0) return 0; if (outA > 255) outA = 255;
const float k = 255.0f / outA;
// Round (not truncate) the partial-alpha mix to avoid a downward bias that
// deepens gradient banding on semi-transparent fills.
auto mix = [&](float s, uint32_t d) { return std::min(255u, static_cast<uint32_t>(((s * 255.0f) * f_fa + d * f_bgA * inv_fa) * k + 0.5f)); };
return (outA << 24) | (mix(b, b_bg) << 16) | (mix(g, g_bg) << 8) | mix(r, r_bg);
}
uint32_t Canvas2D::blendColors(uint32_t bg, uint32_t fg, float coverage, BlendMode mode) {
if (coverage <= 0.0f) return bg;
if (coverage > 1.0f) coverage = 1.0f;
return blend_core(bg, fg, static_cast<uint32_t>((fg >> 24) * coverage + 0.5f), mode);
}
// ======================================================================
// PORTER-DUFF COMPOSITING
// ======================================================================
uint32_t Canvas2D::composite_core(uint32_t bg, uint32_t fg, uint32_t fa, BlendMode mode, CompositeOp op) {
if (op == CompositeOp::SourceOver) return blend_core(bg, fg, fa, mode);
const uint32_t a_bg = bg >> 24;
const uint32_t srgb = fg & 0x00FFFFFFu, drgb = bg & 0x00FFFFFFu;
switch (op) {
case CompositeOp::Clear: return 0;
case CompositeOp::Copy: return fa ? ((fa << 24) | srgb) : 0;
case CompositeOp::SourceIn: { const uint32_t oa = (fa * a_bg + 127u) / 255u; return oa ? ((oa << 24) | srgb) : 0; }
case CompositeOp::SourceOut: { const uint32_t oa = (fa * (255u - a_bg) + 127u) / 255u; return oa ? ((oa << 24) | srgb) : 0; }
case CompositeOp::DestinationIn: { const uint32_t oa = (a_bg * fa + 127u) / 255u; return oa ? ((oa << 24) | drgb) : 0; }
case CompositeOp::DestinationOut: { const uint32_t oa = (a_bg * (255u - fa) + 127u) / 255u; return oa ? ((oa << 24) | drgb) : 0; }
default: break;
}
if (mode == BlendMode::Normal) {
if (op == CompositeOp::DestinationOver) return blend_core(fg, bg, a_bg, BlendMode::Normal);
if (op == CompositeOp::SourceAtop) {
if (a_bg == 0) return 0;
const uint32_t ia = 255u - fa;
const uint32_t r = ((fg & 0xFFu) * fa + (bg & 0xFFu) * ia + 127u) / 255u;
const uint32_t g = (((fg >> 8) & 0xFFu) * fa + ((bg >> 8) & 0xFFu) * ia + 127u) / 255u;
const uint32_t b = (((fg >> 16) & 0xFFu) * fa + ((bg >> 16) & 0xFFu) * ia + 127u) / 255u;
return (a_bg << 24) | (b << 16) | (g << 8) | r;
}
if (op == CompositeOp::DestinationAtop) {
if (fa == 0) return 0;
const uint32_t ia = 255u - a_bg;
const uint32_t r = ((bg & 0xFFu) * a_bg + (fg & 0xFFu) * ia + 127u) / 255u;
const uint32_t g = (((bg >> 8) & 0xFFu) * a_bg + ((fg >> 8) & 0xFFu) * ia + 127u) / 255u;
const uint32_t b = (((bg >> 16) & 0xFFu) * a_bg + ((fg >> 16) & 0xFFu) * ia + 127u) / 255u;
return (fa << 24) | (b << 16) | (g << 8) | r;
}
}
const float as = fa * (1.0f / 255.0f), ab = a_bg * (1.0f / 255.0f);
float Fa, Fb;
switch (op) {
case CompositeOp::SourceAtop:      Fa = ab;        Fb = 1.0f - as; break;
case CompositeOp::DestinationOver: Fa = 1.0f - ab; Fb = 1.0f;      break;
case CompositeOp::DestinationAtop: Fa = 1.0f - ab; Fb = as;        break;
default:                           Fa = 1.0f;      Fb = 1.0f - as; break;
}
float r = (fg & 0xFFu) * (1.0f / 255.0f), g = ((fg >> 8) & 0xFFu) * (1.0f / 255.0f), b = ((fg >> 16) & 0xFFu) * (1.0f / 255.0f);
const float dr = (bg & 0xFFu) * (1.0f / 255.0f), dg = ((bg >> 8) & 0xFFu) * (1.0f / 255.0f), dbl = ((bg >> 16) & 0xFFu) * (1.0f / 255.0f);
if (mode != BlendMode::Normal && a_bg != 0 && fa != 0) {
float br, bgc, bb;
if (mode >= BlendMode::Hue) {
float hf, sf, lf, hb, sb, lb;
rgb_to_hsl(r, g, b, hf, sf, lf);
rgb_to_hsl(dr, dg, dbl, hb, sb, lb);
switch (mode) {
case BlendMode::Hue: lf = lb; sf = sb; break;
case BlendMode::Saturation: lf = lb; hf = hb; break;
case BlendMode::Color: lf = lb; break;
default: hf = hb; sf = sb; break;
}
hsl_to_rgb(hf, sf, lf, br, bgc, bb);
} else {
br = blend_channel(dr, r, mode) * (1.0f / 255.0f);
bgc = blend_channel(dg, g, mode) * (1.0f / 255.0f);
bb = blend_channel(dbl, b, mode) * (1.0f / 255.0f);
}
r = (1.0f - ab) * r + ab * br; g = (1.0f - ab) * g + ab * bgc; b = (1.0f - ab) * b + ab * bb;
}
const float ks = as * Fa, kb = ab * Fb, ao = ks + kb;
if (ao <= 1e-6f) return 0;
const float inv = 1.0f / ao;
auto ch = [&](float s, float d) -> uint32_t {
const float v = (s * ks + d * kb) * inv;
if (v <= 0.0f) return 0u; if (v >= 1.0f) return 255u;
return static_cast<uint32_t>(v * 255.0f + 0.5f);
};
uint32_t oa = static_cast<uint32_t>(ao * 255.0f + 0.5f);
if (oa > 255u) oa = 255u; if (oa == 0u) return 0u;
return (oa << 24) | (ch(b, dbl) << 16) | (ch(g, dg) << 8) | ch(r, dr);
}
// ======================================================================
// RASTERIZER CORE
// ======================================================================
void Canvas2D::raw_extent(const Shape2D& s, float& x0, float& y0, float& x1, float& y1) {
x0 = y0 = 1e30f; x1 = y1 = -1e30f;
auto ext = [&](float x, float y) { x0 = std::min(x0, x); x1 = std::max(x1, x); y0 = std::min(y0, y); y1 = std::max(y1, y); };
for (const auto& sp : s.fill_subpaths) for (const auto& pt : sp) ext(pt.first, pt.second);
for (const auto& e : s.stroke_edges) {
ext(e.x_at_ymin, e.y_min);
ext(e.x_at_ymin + (e.y_max - e.y_min) * e.inv_slope, e.y_max);
}
}
template <class RowFn>
void Canvas2D::raster_scanlines(bool even_odd, RowFn&& emit_row) {
if (m_edges.empty()) return;
std::sort(m_edges.begin(), m_edges.end(), [](const Edge& a, const Edge& b) { return a.y_min < b.y_min; });
float max_y = -1e30f;
for (const auto& e : m_edges) if (e.y_max > max_y) max_y = e.y_max;
const int start_y = std::max(m_toy, static_cast<int>(std::floor(m_edges.front().y_min)));
const int end_y = std::min(m_toy + m_th - 1, static_cast<int>(std::ceil(max_y)));
if (start_y > end_y) { m_edges.clear(); return; }
const size_t arr = static_cast<size_t>(m_tw) + 2;
if (m_partial.size() < arr) { m_partial.assign(arr, 0.0f); m_delta.assign(arr, 0.0f); }
float* partial = m_partial.data(); float* delta = m_delta.data();
constexpr float SUB_W = 1.0f / AA_SUB;
const float fw = static_cast<float>(m_tw);
const size_t ne = m_edges.size();
size_t next = 0;
m_active.clear();
int row_min = m_tw, row_max = -1, touch_max = -1;
auto span = [&](float l, float r) {
l -= m_tox; r -= m_tox;
if (l < 0.0f) l = 0.0f; if (r > fw) r = fw; if (r <= l) return;
const int ix0 = static_cast<int>(l), ix1 = static_cast<int>(r);
if (ix0 < row_min) row_min = ix0; if (ix1 > touch_max) touch_max = ix1;
const int last = ix1 < m_tw ? ix1 : m_tw - 1;
if (last > row_max) row_max = last;
if (ix0 == ix1) partial[ix0] += (r - l) * SUB_W;
else {
partial[ix0] += (static_cast<float>(ix0 + 1) - l) * SUB_W;
delta[ix0 + 1] += SUB_W; delta[ix1] -= SUB_W;
partial[ix1] += (r - static_cast<float>(ix1)) * SUB_W;
}
};
for (int gy = start_y; gy <= end_y; ++gy) {
if (m_active.empty()) {
if (next >= ne) break;
const int ny = static_cast<int>(std::floor(m_edges[next].y_min));
if (ny > gy) { gy = ny; if (gy > end_y) break; }
}
row_min = m_tw; row_max = -1; touch_max = -1;
for (int s = 0; s < AA_SUB; ++s) {
const float sy = gy + (s + 0.5f) * SUB_W;
while (next < ne && m_edges[next].y_min <= sy) {
const Edge& e = m_edges[next++];
if (e.y_max > sy) m_active.push_back({e.y_max, e.x_at_ymin + (sy - e.y_min) * e.inv_slope, e.inv_slope * SUB_W, e.dir});
}
if (m_active.empty()) continue;
size_t n = 0;
for (size_t i = 0; i < m_active.size(); ++i) if (m_active[i].y_max > sy) m_active[n++] = m_active[i];
m_active.resize(n);
if (n == 0) continue;
for (size_t i = 1; i < n; ++i) {
ActiveEdge key = m_active[i]; size_t j = i;
while (j > 0 && m_active[j - 1].x > key.x) { m_active[j] = m_active[j - 1]; --j; }
m_active[j] = key;
}
if (even_odd) { for (size_t i = 0; i + 1 < n; i += 2) span(m_active[i].x, m_active[i + 1].x); }
else {
int wind = 0; float span_start = 0.0f;
for (size_t i = 0; i < n; ++i) {
const int prev = wind; wind += m_active[i].dir;
if (prev == 0 && wind != 0) span_start = m_active[i].x;
else if (prev != 0 && wind == 0) span(span_start, m_active[i].x);
}
}
for (size_t i = 0; i < n; ++i) m_active[i].x += m_active[i].dx;
}
if (row_max < row_min) continue;
emit_row(gy, row_min, row_max, touch_max, partial, delta);
}
m_edges.clear(); m_active.clear();
}
void Canvas2D::raster_edges(const Paint& paint, bool even_odd, float obj_x, float obj_y, float obj_w, float obj_h) {
// globalAlpha multiplies the source alpha (coverage x paint alpha x ga).
// ga == 0 rasterizes nothing; any active composite operator still runs on
// the (empty) source layer in draw_layered, matching HTML semantics.
const float ga = m_global_alpha;
if (!(ga > 0.0f)) { m_edges.clear(); return; }
const bool solid = paint.type == Paint::SOLID;
const bool normal = m_blend_mode == BlendMode::Normal;
const bool full_ga = ga >= 1.0f;
const bool fast_opaque = paint.is_solid_opaque() && normal && full_ga;
const uint32_t solid_c = paint.color;
const Gradient* grad = (paint.type == Paint::GRADIENT) ? paint.gradient : nullptr;
Transform it; if (!solid) it = inv();                  // device -> user
// Gradient anti-aliasing: gm maps device -> gradient space, so its columns
// (gm.a,gm.b) and (gm.c,gm.d) are the gradient-space steps of one device
// pixel. For affine (linear) parameters the pixel's exact t-extent is
// half = (|tkx| + |tky|) / 2; sample() box-filters the stop ramp over that
// interval, area-averaging hard stops and steep ramps instead of letting
// them staircase between pixel centres. Radial/conic use color_gs_aa,
// which derives the footprint from the analytic parameter gradient and
// gives the radial NaN-domain boundary fractional coverage. Shape-edge
// coverage AA is unchanged and multiplies with this paint colour.
Transform gm; float tkx = 0, tky = 0, tk0 = 0; bool affine = false; float half = 0.0f;
if (grad) {
grad->prepare();
gm = grad->inv_transform(); gm.multiply(it);       // device -> gradient space
float ka, kb, kc;
if (grad->affine_param(ka, kb, kc)) {
tkx = ka * gm.a + kb * gm.b; tky = ka * gm.c + kb * gm.d; tk0 = ka * gm.e + kb * gm.f + kc;
half = 0.5f * (std::fabs(tkx) + std::fabs(tky));
affine = true;
}
}
auto get_c = [&](int dx, int dy) -> uint32_t {
if (solid) return solid_c;
const float fx = static_cast<float>(dx) + 0.5f, fy = static_cast<float>(dy) + 0.5f;
if (grad) {
if (affine) return grad->sample(tkx * fx + tky * fy + tk0, dx, dy, half);
return grad->color_gs_aa(gm.a * fx + gm.c * fy + gm.e, gm.b * fx + gm.d * fy + gm.f,
dx, dy, gm.a, gm.b, gm.c, gm.d);
}
return paint.get_color(it.a * fx + it.c * fy + it.e, it.b * fx + it.d * fy + it.f, obj_x, obj_y, obj_w, obj_h, dx, dy);
};
raster_scanlines(even_odd, [&](int gy, int row_min, int row_max, int touch_max, float* partial, float* delta) {
float run = 0.0f;
uint32_t* row = m_tbuf + static_cast<size_t>(gy - m_toy) * m_tw;
const int ox = m_tox;
for (int x = row_min; x <= row_max; ++x) {
run += delta[x];
const float cov = partial[x] + run;
partial[x] = 0.0f; delta[x] = 0.0f;
if (cov <= 0.002f) continue;
if (cov >= 0.998f) {
if (fast_opaque) { row[x] = solid_c; continue; }
const uint32_t c = get_c(x + ox, gy);
if (full_ga && normal && (c >> 24) == 255u) { row[x] = c; continue; }
row[x] = blendColors(row[x], c, ga, m_blend_mode);
} else {
row[x] = blendColors(row[x], get_c(x + ox, gy), cov * ga, m_blend_mode);
}
}
for (int x = row_max + 1; x <= touch_max; ++x) { partial[x] = 0.0f; delta[x] = 0.0f; }
});
}
void Canvas2D::raster_coverage(uint8_t* cov, bool even_odd) {
raster_scanlines(even_odd, [&](int gy, int row_min, int row_max, int touch_max, float* partial, float* delta) {
float run = 0.0f;
uint8_t* row = cov + static_cast<size_t>(gy - m_toy) * m_tw;
for (int x = row_min; x <= row_max; ++x) {
run += delta[x];
const float c = partial[x] + run;
partial[x] = 0.0f; delta[x] = 0.0f;
if (c > 0.002f) row[x] = (c >= 0.998f) ? 255 : static_cast<uint8_t>(c * 255.0f + 0.5f);
}
for (int x = row_max + 1; x <= touch_max; ++x) { partial[x] = 0.0f; delta[x] = 0.0f; }
});
}
void Canvas2D::box_blur(uint32_t* buf, int w, int h, int radius) {
if (radius <= 0) return;
const int n = w * h, r = std::max(1, (int)(radius * 1.5f));
m_blur_a.resize(n); m_blur_b.resize(n);
uint8_t* a1 = m_blur_a.data(); uint8_t* a2 = m_blur_b.data();
for (int i = 0; i < n; ++i) a1[i] = (uint8_t)(buf[i] >> 24);
m_blur_recip.resize(static_cast<size_t>(2 * r + 2));
for (int c = 1; c < 2 * r + 2; ++c) m_blur_recip[c] = (65536u + c - 1) / c;
const uint32_t* recip = m_blur_recip.data();
auto hpass = [&](const uint8_t* src, uint8_t* dst) {
for (int y = 0; y < h; ++y) {
const uint8_t* s = src + static_cast<size_t>(y) * w; uint8_t* d = dst + static_cast<size_t>(y) * w;
uint32_t sum = 0;
for (int k = 0, init = std::min(r, w - 1); k <= init; ++k) sum += s[k];
for (int x = 0; x < w; ++x) {
const int lo = x - r < 0 ? 0 : x - r, hi = x + r > w - 1 ? w - 1 : x + r;
d[x] = (uint8_t)((sum * recip[hi - lo + 1]) >> 16);
if (x + r + 1 < w) sum += s[x + r + 1];
if (x - r >= 0) sum -= s[x - r];
}
}
};
auto vpass = [&](const uint8_t* src, uint8_t* dst) {
m_blur_col.assign(static_cast<size_t>(w), 0u); uint32_t* col = m_blur_col.data();
for (int k = 0, init = std::min(r, h - 1); k <= init; ++k) { const uint8_t* s = src + static_cast<size_t>(k) * w; for (int x = 0; x < w; ++x) col[x] += s[x]; }
for (int y = 0; y < h; ++y) {
const int lo = y - r < 0 ? 0 : y - r, hi = y + r > h - 1 ? h - 1 : y + r;
const uint32_t inv = recip[hi - lo + 1]; uint8_t* d = dst + static_cast<size_t>(y) * w;
for (int x = 0; x < w; ++x) d[x] = (uint8_t)((col[x] * inv) >> 16);
if (y + r + 1 < h) { const uint8_t* s = src + static_cast<size_t>(y + r + 1) * w; for (int x = 0; x < w; ++x) col[x] += s[x]; }
if (y - r >= 0) { const uint8_t* s = src + static_cast<size_t>(y - r) * w; for (int x = 0; x < w; ++x) col[x] -= s[x]; }
}
};
hpass(a1, a2); vpass(a2, a1); hpass(a1, a2); vpass(a2, a1);
const uint32_t rgb = m_shadow_color & 0x00FFFFFFu;
for (int i = 0; i < n; ++i) buf[i] = (static_cast<uint32_t>(a1[i]) << 24) | rgb;
}
void Canvas2D::composite_buffer(const uint32_t* src, int sw, int sh, int off_x, int off_y) {
const int start_x = std::max(m_tox, off_x), start_y = std::max(m_toy, off_y);
const int end_x = std::min(m_tox + m_tw, off_x + sw), end_y = std::min(m_toy + m_th, off_y + sh);
for (int y = start_y; y < end_y; ++y) {
const uint32_t* src_row = src + static_cast<size_t>(y - off_y) * sw;
uint32_t* dst_row = m_tbuf + static_cast<size_t>(y - m_toy) * m_tw;
for (int x = start_x; x < end_x; ++x) {
const uint32_t fg = src_row[x - off_x];
if (fg >> 24) dst_row[x - m_tox] = blend_core(dst_row[x - m_tox], fg, fg >> 24, m_blend_mode);
}
}
}
void Canvas2D::composite_op_buffer(const uint32_t* src, int sw, int sh, int off_x, int off_y, CompositeOp op, BlendMode mode) {
const int start_x = std::max(m_tox, off_x), start_y = std::max(m_toy, off_y);
const int end_x = std::min(m_tox + m_tw, off_x + sw), end_y = std::min(m_toy + m_th, off_y + sh);
for (int y = start_y; y < end_y; ++y) {
const uint32_t* src_row = src + static_cast<size_t>(y - off_y) * sw;
uint32_t* dst_row = m_tbuf + static_cast<size_t>(y - m_toy) * m_tw;
for (int x = start_x; x < end_x; ++x) {
const uint32_t fg = src_row[x - off_x];
dst_row[x - m_tox] = composite_core(dst_row[x - m_tox], fg, fg >> 24, mode, op);
}
}
}
// ======================================================================
// FILTERS MATH
// ======================================================================
static inline void flt_premultiply(uint32_t* px, size_t n) {
for (size_t i = 0; i < n; ++i) {
const uint32_t p = px[i], a = p >> 24;
if (a == 255u) continue;
if (a == 0u) { px[i] = 0; continue; }
const uint32_t r = ((p & 255u) * a + 127u) / 255u;
const uint32_t g = (((p >> 8) & 255u) * a + 127u) / 255u;
const uint32_t b = (((p >> 16) & 255u) * a + 127u) / 255u;
px[i] = (a << 24) | (b << 16) | (g << 8) | r;
}
}
static inline void flt_unpremultiply(uint32_t* px, size_t n) {
for (size_t i = 0; i < n; ++i) {
const uint32_t p = px[i], a = p >> 24;
if (a == 0u) { px[i] = 0; continue; }
if (a == 255u) continue;
const uint32_t r = std::min(255u, ((p & 255u) * 255u + a / 2) / a);
const uint32_t g = std::min(255u, (((p >> 8) & 255u) * 255u + a / 2) / a);
const uint32_t b = std::min(255u, (((p >> 16) & 255u) * 255u + a / 2) / a);
px[i] = (a << 24) | (b << 16) | (g << 8) | r;
}
}
static inline void flt_acc(uint32_t p, uint32_t* s) { s[0] += p & 255u; s[1] += (p >> 8) & 255u; s[2] += (p >> 16) & 255u; s[3] += p >> 24; }
static inline void flt_dec(uint32_t p, uint32_t* s) { s[0] -= p & 255u; s[1] -= (p >> 8) & 255u; s[2] -= (p >> 16) & 255u; s[3] -= p >> 24; }
static inline uint32_t flt_pack(const uint32_t* s, uint32_t recip) {
const uint32_t r = std::min(255u, (s[0] * recip + 32768u) >> 16);
const uint32_t g = std::min(255u, (s[1] * recip + 32768u) >> 16);
const uint32_t b = std::min(255u, (s[2] * recip + 32768u) >> 16);
const uint32_t a = std::min(255u, (s[3] * recip + 32768u) >> 16);
return (a << 24) | (b << 16) | (g << 8) | r;
}
static void flt_box_h(const uint32_t* src, uint32_t* dst, int w, int h, int r) {
if (r <= 0) { if (src != dst) std::memcpy(dst, src, static_cast<size_t>(w) * h * 4); return; }
const uint32_t cnt = static_cast<uint32_t>(2 * r + 1); const uint32_t recip = 65536u / cnt;
for (int y = 0; y < h; ++y) {
const uint32_t* s = src + static_cast<size_t>(y) * w; uint32_t* d = dst + static_cast<size_t>(y) * w;
uint32_t sum[4] = {0, 0, 0, 0};
for (int k = 0, init = std::min(r, w - 1); k <= init; ++k) flt_acc(s[k], sum);
for (int x = 0; x < w; ++x) {
d[x] = flt_pack(sum, recip);
if (x + r + 1 < w) flt_acc(s[x + r + 1], sum);
if (x - r >= 0) flt_dec(s[x - r], sum);
}
}
}
static void flt_box_v(const uint32_t* src, uint32_t* dst, int w, int h, int r) {
if (r <= 0) { if (src != dst) std::memcpy(dst, src, static_cast<size_t>(w) * h * 4); return; }
const uint32_t cnt = static_cast<uint32_t>(2 * r + 1); const uint32_t recip = 65536u / cnt;
std::vector<uint32_t> col(static_cast<size_t>(w) * 4, 0u);
for (int k = 0, init = std::min(r, h - 1); k <= init; ++k) {
const uint32_t* s = src + static_cast<size_t>(k) * w;
for (int x = 0; x < w; ++x) flt_acc(s[x], col.data() + static_cast<size_t>(x) * 4);
}
for (int y = 0; y < h; ++y) {
uint32_t* d = dst + static_cast<size_t>(y) * w;
for (int x = 0; x < w; ++x) d[x] = flt_pack(col.data() + static_cast<size_t>(x) * 4, recip);
if (y + r + 1 < h) {
const uint32_t* s = src + static_cast<size_t>(y + r + 1) * w;
for (int x = 0; x < w; ++x) flt_acc(s[x], col.data() + static_cast<size_t>(x) * 4);
}
if (y - r >= 0) {
const uint32_t* s = src + static_cast<size_t>(y - r) * w;
for (int x = 0; x < w; ++x) flt_dec(s[x], col.data() + static_cast<size_t>(x) * 4);
}
}
}
static void flt_box_sizes(float sigma, int out[3]) {
const float w_ideal = std::sqrt(4.0f * sigma * sigma + 1.0f);
int wl = static_cast<int>(std::floor(w_ideal));
if ((wl & 1) == 0) --wl; if (wl < 1) wl = 1;
const int wu = wl + 2;
const float m_ideal = (12.0f * sigma * sigma - 3.0f * wl * wl - 12.0f * wl - 3.0f) / (-4.0f * wl - 4.0f);
int m = static_cast<int>(std::floor(m_ideal + 0.5f));
if (m < 0) m = 0; if (m > 3) m = 3;
for (int i = 0; i < 3; ++i) out[i] = (i < m ? wl : wu) / 2;
}
static void flt_gaussian(uint32_t* buf, int w, int h, float sx, float sy) {
if (!(sx > 0.0f) && !(sy > 0.0f)) return;
const size_t n = static_cast<size_t>(w) * h;
flt_premultiply(buf, n);
std::vector<uint32_t> tmp(n);
int rx[3] = {0, 0, 0}, ry[3] = {0, 0, 0};
if (sx > 0.0f) flt_box_sizes(sx, rx); if (sy > 0.0f) flt_box_sizes(sy, ry);
for (int i = 0; i < 3; ++i) { flt_box_h(buf, tmp.data(), w, h, rx[i]); flt_box_v(tmp.data(), buf, w, h, ry[i]); }
flt_unpremultiply(buf, n);
}
static void flt_color_matrix(uint32_t* px, size_t n, const float* m) {
for (size_t i = 0; i < n; ++i) {
const uint32_t p = px[i];
const float r = static_cast<float>(p & 255u), g = static_cast<float>((p >> 8) & 255u);
const float b = static_cast<float>((p >> 16) & 255u), a = static_cast<float>(p >> 24);
float o[4];
o[0] = m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4] * 255.0f;
o[1] = m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9] * 255.0f;
o[2] = m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14] * 255.0f;
o[3] = m[15] * r + m[16] * g + m[17] * b + m[18] * a + m[19] * 255.0f;
uint32_t c[4];
for (int k = 0; k < 4; ++k) {
float v = o[k]; if (!(v > 0.0f)) v = 0.0f; if (v > 255.0f) v = 255.0f;
c[k] = static_cast<uint32_t>(v + 0.5f);
}
px[i] = (c[3] << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
}
}
void Filter::apply(uint32_t* pixels, int w, int h) const {
if (!pixels || w <= 0 || h <= 0 || m_prims.empty()) return;
const size_t n = static_cast<size_t>(w) * h;
const bool lin = (m_cs == ColorSpace::LinearRGB);
float s2l[256]; uint8_t l2s[256];
if (lin) {
for (int i = 0; i < 256; ++i) {
const float v = static_cast<float>(i) / 255.0f;
s2l[i] = (v <= 0.04045f) ? (v / 12.92f) : std::pow((v + 0.055f) / 1.055f, 2.4f);
}
for (int i = 0; i < 256; ++i) {
const float v = static_cast<float>(i) / 255.0f;
const float s = (v <= 0.0031308f) ? (v * 12.92f) : (1.055f * std::pow(v, 1.0f / 2.4f) - 0.055f);
l2s[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, s * 255.0f + 0.5f)));
}
for (size_t i = 0; i < n; ++i) {
const uint32_t p = pixels[i];
const uint32_t r = static_cast<uint32_t>(s2l[p & 255u] * 255.0f + 0.5f);
const uint32_t g = static_cast<uint32_t>(s2l[(p >> 8) & 255u] * 255.0f + 0.5f);
const uint32_t b = static_cast<uint32_t>(s2l[(p >> 16) & 255u] * 255.0f + 0.5f);
pixels[i] = (p & 0xFF000000u) | (b << 16) | (g << 8) | r;
}
}
for (const Primitive& p : m_prims) {
switch (p.type) {
case Primitive::Type::GaussianBlur: flt_gaussian(pixels, w, h, p.std_x, p.std_y); break;
case Primitive::Type::ColorMatrix: flt_color_matrix(pixels, n, p.m); break;
case Primitive::Type::DropShadow: {
const uint32_t ca = p.color >> 24; if (ca == 0) break;
const uint32_t rgb = p.color & 0x00FFFFFFu;
std::vector<uint32_t> sh(n);
for (size_t i = 0; i < n; ++i) {
const uint32_t a = ((pixels[i] >> 24) * ca + 127u) / 255u; sh[i] = (a << 24) | rgb;
}
flt_gaussian(sh.data(), w, h, p.std_x, p.std_y);
const int ox = static_cast<int>(std::lround(p.dx)), oy = static_cast<int>(std::lround(p.dy));
std::vector<uint32_t> out(n, 0u);
for (int y = 0; y < h; ++y) {
const int sy = y - oy; if (sy < 0 || sy >= h) continue;
for (int x = 0; x < w; ++x) {
const int sx = x - ox; if (sx < 0 || sx >= w) continue;
out[static_cast<size_t>(y) * w + x] = sh[static_cast<size_t>(sy) * w + sx];
}
}
for (size_t i = 0; i < n; ++i) pixels[i] = Canvas2D::blend_core(out[i], pixels[i], pixels[i] >> 24, BlendMode::Normal);
break;
}
}
}
if (lin) {
for (size_t i = 0; i < n; ++i) {
const uint32_t p = pixels[i];
const uint32_t r = l2s[p & 255u], g = l2s[(p >> 8) & 255u], b = l2s[(p >> 16) & 255u];
pixels[i] = (p & 0xFF000000u) | (b << 16) | (g << 8) | r;
}
}
}
Canvas2D& Canvas2D::apply_filter(const Filter& f) {
if (buffer && !f.empty()) f.apply(buffer, width, height);
return *this;
}
Canvas2D& Canvas2D::apply_filter(const Filter& f, float x, float y, float w, float h) {
if (!buffer || f.empty() || !(w > 0.0f) || !(h > 0.0f)) return *this;
const int x0 = std::max(0, static_cast<int>(std::floor(x)));
const int y0 = std::max(0, static_cast<int>(std::floor(y)));
const int x1 = std::min(width, static_cast<int>(std::ceil(x + w)));
const int y1 = std::min(height, static_cast<int>(std::ceil(y + h)));
if (x0 >= x1 || y0 >= y1) return *this;
const int bw = x1 - x0, bh = y1 - y0;
std::vector<uint32_t> tmp(static_cast<size_t>(bw) * bh);
for (int yy = 0; yy < bh; ++yy)
std::memcpy(tmp.data() + static_cast<size_t>(yy) * bw, buffer + static_cast<size_t>(y0 + yy) * width + x0, static_cast<size_t>(bw) * 4);
f.apply(tmp.data(), bw, bh);
for (int yy = 0; yy < bh; ++yy)
std::memcpy(buffer + static_cast<size_t>(y0 + yy) * width + x0, tmp.data() + static_cast<size_t>(yy) * bw, static_cast<size_t>(bw) * 4);
return *this;
}
void Canvas2D::filter_device_bounds(const Filter& f, const float ub[4], float b[4]) const {
const float uw = (ub[2] > ub[0]) ? (ub[2] - ub[0]) : 1.0f;
const float uh = (ub[3] > ub[1]) ? (ub[3] - ub[1]) : 1.0f;
float rx, ry, rw, rh;
if (f.units() == Filter::Units::UserSpaceOnUse && f.has_region()) {
rx = f.region_x(); ry = f.region_y(); rw = f.region_w(); rh = f.region_h();
} else {
rx = ub[0] + f.region_x() * uw; ry = ub[1] + f.region_y() * uh;
rw = f.region_w() * uw;         rh = f.region_h() * uh;
}
float x0 = 1e30f, y0 = 1e30f, x1 = -1e30f, y1 = -1e30f;
for (int i = 0; i < 4; ++i) {
float px = rx + ((i == 1 || i == 2) ? rw : 0.0f), py = ry + ((i >= 2) ? rh : 0.0f);
m_transform.apply(px, py);
x0 = std::min(x0, px); x1 = std::max(x1, px); y0 = std::min(y0, py); y1 = std::max(y1, py);
}
b[0] = x0; b[1] = y0; b[2] = x1; b[3] = y1;
}
#endif // CANVAS2D_RASTER_CPP