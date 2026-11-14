// ./canvas2d_styles.hpp
#ifndef CANVAS2D_STYLES_HPP
#define CANVAS2D_STYLES_HPP
#include <cstdint>
#include <cmath>
#include <algorithm>
#include <vector>
#include <utility>
#include <initializer_list>
#include <path2d.hpp>
#include "shape2d.hpp"
#include "font.hpp"
#include "image.cpp"
// image.cpp leaks single-letter macros (notably `e`) that break member names
// like Transform::e. Scrub them immediately (#undef of an undefined name is legal).
#undef e
#undef epuc
#undef BM
#undef f2f
#undef float2fixed
#undef PNG_TYPE
#undef MARKER_none
constexpr uint32_t rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255) {
return (static_cast<uint32_t>(a) << 24) | (static_cast<uint32_t>(b) << 16) |
(static_cast<uint32_t>(g) << 8) | static_cast<uint32_t>(r);
}
// ======================================================================
// 1. AFFINE TRANSFORM
// ======================================================================
struct Transform {
float a = 1.0f, b = 0.0f, c = 0.0f, d = 1.0f, e = 0.0f, f = 0.0f;
Transform() = default;
Transform(float ma, float mb, float mc, float md, float me, float mf)
: a(ma), b(mb), c(mc), d(md), e(me), f(mf) {}
void multiply(const Transform& t) {
const float na = a * t.a + c * t.b, nb = b * t.a + d * t.b;
const float nc = a * t.c + c * t.d, nd = b * t.c + d * t.d;
const float ne = a * t.e + c * t.f + e, nf = b * t.e + d * t.f + f;
a = na; b = nb; c = nc; d = nd; e = ne; f = nf;
}
void translate(float tx, float ty) { e += a * tx + c * ty; f += b * tx + d * ty; }
void scale(float sx, float sy) { a *= sx; b *= sx; c *= sy; d *= sy; }
void rotate(float angle) { const float cs = std::cos(angle), sn = std::sin(angle); multiply(Transform(cs, sn, -sn, cs, 0.0f, 0.0f)); }
void skew_x(float angle) { multiply(Transform(1.0f, 0.0f, std::tan(angle), 1.0f, 0.0f, 0.0f)); }
void skew_y(float angle) { multiply(Transform(1.0f, std::tan(angle), 0.0f, 1.0f, 0.0f, 0.0f)); }
void transform(float ta, float tb, float tc, float td, float te, float tf) { multiply(Transform(ta, tb, tc, td, te, tf)); }
void set_transform(float ta, float tb, float tc, float td, float te, float tf) { a = ta; b = tb; c = tc; d = td; e = te; f = tf; }
void reset() { *this = Transform(); }
inline void apply(float& x, float& y) const {
const float nx = a * x + c * y + e, ny = b * x + d * y + f;
x = nx; y = ny;
}
float determinant() const { return a * d - b * c; }
float average_scale() const {
const float s = (std::sqrt(a * a + b * b) + std::sqrt(c * c + d * d)) * 0.5f;
return (s > 1e-6f) ? s : 1e-6f;
}
bool invertible() const { return std::fabs(determinant()) > 1e-12f; }
Transform inverse() const {
const float det = determinant();
if (std::fabs(det) < 1e-12f) return Transform();
const float id = 1.0f / det;
return Transform(d * id, -b * id, -c * id, a * id, (c * f - d * e) * id, (b * e - a * f) * id);
}
};
// ======================================================================
// 2. GRADIENTS, PATTERNS & PAINT
// ======================================================================
struct GradientStop { float offset; uint32_t color; };
class Gradient {
struct PM {                                   // premultiplied, 0..255
float r, g, b, a;
PM operator+(const PM& o) const { return PM{r + o.r, g + o.g, b + o.b, a + o.a}; }
PM operator-(const PM& o) const { return PM{r - o.r, g - o.g, b - o.b, a - o.a}; }
PM operator*(float s) const { return PM{r * s, g * s, b * s, a * s}; }
};
public:
enum class Spread { Pad, Reflect, Repeat };
std::vector<GradientStop> stops;
Transform transform;
Spread spread = Spread::Pad;
virtual ~Gradient() = default;
// Stable insert: equal offsets keep insertion order (hard stops work).
Gradient& add_stop(float offset, uint32_t color) {
if (!(offset > 0.0f)) offset = 0.0f; else if (offset > 1.0f) offset = 1.0f;
auto it = std::upper_bound(stops.begin(), stops.end(), offset,
[](float o, const GradientStop& s) { return o < s.offset; });
stops.insert(it, GradientStop{offset, color});
m_lut_valid = false; return *this;
}
Gradient& set_spread(Spread s) { spread = s; return *this; }
Spread get_spread() const { return spread; }
Gradient& set_transform(float a, float b, float c, float d, float e, float f) {
transform.set_transform(a, b, c, d, e, f); m_inv_dirty = true; return *this;
}
Gradient& set_transform(const Transform& t) { transform = t; m_inv_dirty = true; return *this; }
void invalidate() { m_lut_valid = false; m_inv_dirty = true; }
void prepare() const { if (!m_lut_valid) build(); }
// Gradient-space point -> raw parameter t. NaN = "paint nothing".
virtual float param(float gx, float gy) const = 0;
// If t is affine in gradient space (linear gradients): t = ka*gx + kb*gy + kc.
virtual bool affine_param(float&, float&, float&) const { return false; }
// Local parameter gradient (dt/dgx, dt/dgy) at a valid sample. Used to size
// the pixel footprint in t for footprint anti-aliasing. Cheap (no sqrt).
virtual bool param_grad(float gx, float gy, float t, float& dx, float& dy) const { return false; }
// Cyclic parameter (conic): the stop ramp wraps at integer t, so the seam
// is filtered like a Repeat spread even when spread == Pad.
virtual bool wraps() const { return false; }
// Parameter can be undefined (NaN) outside a bounded domain (radial cone):
// boundary pixels need validity-probe coverage.
virtual bool has_nan_domain() const { return false; }
virtual bool is_opaque() const {
for (const auto& s : stops) if ((s.color >> 24) != 255) return false;
return true;
}
uint32_t color_gs(float gx, float gy, int px, int py) const {
const float t = param(gx, gy);
return (t != t) ? 0u : sample(t, px, py);
}
// ----------------------------------------------------------------------
// Footprint-aware sampling. (ex,ey) / (fx,fy) are the gradient-space steps
// of one device pixel in x / y. A device pixel covers an interval of t;
// box-filtering the premultiplied ramp over that interval area-averages
// hard stops, steep ramps and the conic seam instead of point-sampling
// them (which staircases). Radial NaN-domain edges get fractional coverage
// from four half-diagonal validity probes.
// ----------------------------------------------------------------------
uint32_t color_gs_aa(float gx, float gy, int px, int py,
float ex, float ey, float fx, float fy) const {
float ka, kb, kc;
if (affine_param(ka, kb, kc)) {
// Exact t-extent of the pixel square for an affine parameter.
const float half = 0.5f * (std::fabs(ka * ex + kb * ey) + std::fabs(ka * fx + kb * fy));
return sample(ka * gx + kb * gy + kc, px, py, half);
}
const float t = param(gx, gy);
float gdx = 0.0f, gdy = 0.0f, half = 0.0f;
if (t == t && param_grad(gx, gy, t, gdx, gdy))
half = 0.5f * (std::fabs(gdx * ex + gdy * ey) + std::fabs(gdx * fx + gdy * fy));
if (!has_nan_domain()) return (t == t) ? sample(t, px, py, half) : 0u;
// Validity probes at the four half-diagonals of the device pixel.
const float hx = 0.5f * (ex + fx), hy = 0.5f * (ey + fy);
const float ax = 0.5f * (ex - fx), ay = 0.5f * (ey - fy);
const float t1 = param(gx + hx, gy + hy), t2 = param(gx - hx, gy - hy);
const float t3 = param(gx + ax, gy + ay), t4 = param(gx - ax, gy - ay);
const int valid = (t == t) + (t1 == t1) + (t2 == t2) + (t3 == t3) + (t4 == t4);
if (valid == 5) return sample(t, px, py, half);
if (valid == 0) return 0u;
// Boundary pixel: coverage = valid fraction, colour = mean of valid taps.
float sum = 0.0f;
if (t == t) sum += t; if (t1 == t1) sum += t1; if (t2 == t2) sum += t2;
if (t3 == t3) sum += t3; if (t4 == t4) sum += t4;
const float cov = static_cast<float>(valid) * 0.2f;
const uint32_t c = sample(sum / static_cast<float>(valid), px, py, half * cov);
const uint32_t a = static_cast<uint32_t>((c >> 24) * cov + 0.5f);
return a ? ((a << 24) | (c & 0x00FFFFFFu)) : 0u;
}
uint32_t get_color(float x, float y, int px = 0, int py = 0) const {
float tx = x, ty = y; inv_transform().apply(tx, ty);
return color_gs(tx, ty, px, py);
}
uint32_t lookup(float t, int px = 0, int py = 0) const { return sample(t, px, py); }
// Spread -> float premultiplied LUT -> dithered quantize (RGB *and* alpha).
// half > 0: box-filter over [t-half, t+half] whenever the interval contains
// a stop knot, a spread wrap or a pad clamp corner (hard-stop / seam AA).
inline uint32_t sample(float t, int px, int py, float half = 0.0f) const {
if (!m_lut_valid) build();
if (m_pm.empty()) return 0u;
PM c;
if (half > 1e-7f && area_needed(t - half, t + half)) c = area_color(t, half);
else c = point_color(t);
if (!(c.a > 0.0f)) return 0u;
const float d = dither_offset(px, py);
const uint32_t ai = q8(c.a + d);
if (ai == 0u) return 0u;
const float inv = (c.a >= 255.0f) ? 1.0f : 255.0f / c.a;
return (ai << 24) | (q8(c.b * inv + d) << 16) | (q8(c.g * inv + d) << 8) | q8(c.r * inv + d);
}
const Transform& inv_transform() const {
const Transform& s = m_inv_src;
if (m_inv_dirty || s.a != transform.a || s.b != transform.b || s.c != transform.c ||
s.d != transform.d || s.e != transform.e || s.f != transform.f) {
m_inv_src = transform; m_inv_transform = transform.inverse(); m_inv_dirty = false;
}
return m_inv_transform;
}
// 8x8 Bayer: 64 levels instead of 16, range [-0.5, 0.5).
static inline float dither_offset(int x, int y) {
return (static_cast<float>(kBayer8[((y & 7) << 3) | (x & 7)]) + 0.5f) * (1.0f / 64.0f) - 0.5f;
}
private:
static constexpr int LUT_SIZE = 2048;
static constexpr uint8_t kBayer8[64] = {
0,32, 8,40, 2,34,10,42,  48,16,56,24,50,18,58,26,
12,44, 4,36,14,46, 6,38,  60,28,52,20,62,30,54,22,
3,35,11,43, 1,33, 9,41,  51,19,59,27,49,17,57,25,
15,47, 7,39,13,45, 5,37,  63,31,55,23,61,29,53,21 };
mutable std::vector<PM> m_lut, m_pm, m_int;
mutable PM m_total = {0.0f, 0.0f, 0.0f, 0.0f};
mutable bool m_lut_valid = false, m_hard = false;
mutable Transform m_inv_transform, m_inv_src;
mutable bool m_inv_dirty = true;
static inline uint32_t q8(float v) { return v <= 0.0f ? 0u : (v >= 255.0f ? 255u : static_cast<uint32_t>(v + 0.5f)); }
PM eval_pm(float t) const {
const size_t n = m_pm.size();
if (n == 1 || t <= stops.front().offset) return m_pm.front();
if (t >= stops.back().offset) return m_pm.back();
size_t lo = 0, hi = n - 1;                   // off[lo] <= t < off[hi]
while (hi - lo > 1) { const size_t mid = (lo + hi) >> 1; if (stops[mid].offset <= t) lo = mid; else hi = mid; }
const float f = (t - stops[lo].offset) / (stops[hi].offset - stops[lo].offset);
const PM& a = m_pm[lo]; const PM& b = m_pm[hi];
return a + (b - a) * f;
}
// Legacy point-sampling path (unchanged behaviour when half == 0).
PM point_color(float t) const {
if (spread == Spread::Repeat) t -= std::floor(t);
else if (spread == Spread::Reflect) { t = std::fabs(t); t -= 2.0f * std::floor(t * 0.5f); if (t > 1.0f) t = 2.0f - t; }
if (!(t > 0.0f)) t = 0.0f; else if (t > 1.0f) t = 1.0f;
if (m_hard) return eval_pm(t);               // exact at hard stops
const float u = t * LUT_SIZE; int i = static_cast<int>(u);
if (i >= LUT_SIZE) i = LUT_SIZE - 1;
const float f = u - static_cast<float>(i);
return m_lut[i] + (m_lut[i + 1] - m_lut[i]) * f;
}
// Does the pixel's t-interval contain a discontinuity / knot that needs
// area averaging? Smooth interiors keep the cheap point/LUT path.
bool area_needed(float a, float b) const {
if (wraps() || spread != Spread::Pad) {
if (std::floor(a) != std::floor(b)) return true;   // wrap / seam crossing
}
if (a < 0.0f || b > 1.0f) return true;             // pad clamp corner
auto it = std::upper_bound(stops.begin(), stops.end(), a,
[](float v, const GradientStop& s) { return v < s.offset; });
return it != stops.end() && it->offset < b;        // stop knot inside footprint
}
// Box-filtered premultiplied colour over [t-half, t+half] with spread mapping.
PM area_color(float t, float half) const {
const float a = t - half, b = t + half;
if (wraps() || spread == Spread::Repeat) return repeat_area(a, b);
if (spread == Spread::Reflect) return reflect_area(a, b);
float ca = a < 0.0f ? 0.0f : (a > 1.0f ? 1.0f : a);
float cb = b < 0.0f ? 0.0f : (b > 1.0f ? 1.0f : b);
if (cb - ca < 1e-9f) return eval_pm(t < 0.0f ? 0.0f : (t > 1.0f ? 1.0f : t));
return eval_pm_area(ca, cb);
}
PM repeat_area(float a, float b) const {
const float w = b - a;
const float fa = a - std::floor(a), fb = b - std::floor(b);
const float cross = std::floor(b) - std::floor(a);
if (cross >= 2.0f) {                         // >= one full period inside
const float wt = (1.0f - fa) + fb;
PM acc = eval_pm_area(0.0f, 1.0f) * (w - wt);
if (1.0f - fa > 1e-9f) acc = acc + eval_pm_area(fa, 1.0f) * (1.0f - fa);
if (fb > 1e-9f) acc = acc + eval_pm_area(0.0f, fb) * fb;
return acc * (1.0f / w);
}
if (cross >= 1.0f) {                         // one seam crossing
const float w1 = 1.0f - fa, w2 = fb;
PM acc{0.0f, 0.0f, 0.0f, 0.0f};
if (w1 > 1e-9f) acc = acc + eval_pm_area(fa, 1.0f) * w1;
if (w2 > 1e-9f) acc = acc + eval_pm_area(0.0f, fb) * w2;
return acc * (1.0f / w);
}
return eval_pm_area(fa, fa + w);
}
PM reflect_area(float a, float b) const {
const float w = b - a;
PM acc{0.0f, 0.0f, 0.0f, 0.0f};
float rest = w;
if (w >= 2.0f) {                             // whole 2-periods: exact mean
const float whole = 2.0f * std::floor(w * 0.5f);
acc = eval_pm_area(0.0f, 1.0f) * whole;
rest = w - whole;                            // even shift keeps the phase
}
float s = a; const float e = a + rest;
while (s < e - 1e-9f) {                      // <= 3 unit pieces
const float k = std::floor(s);
const float m = std::min(k + 1.0f, e);
const float u0 = s - k, u1 = m - k;
const bool odd = (std::fmod(k, 2.0f) != 0.0f);
const PM seg = odd ? eval_pm_area(1.0f - u1, 1.0f - u0) : eval_pm_area(u0, u1);
acc = acc + seg * (m - s);
s = m;
}
return acc * (1.0f / w);
}
// Exact mean of the premultiplied ramp over [a,b] within [0,1].
PM eval_pm_area(float a, float b) const {
const size_t n = m_pm.size();
if (n == 1) return m_pm[0];
const float o0 = stops.front().offset, oN = stops.back().offset;
if (b <= o0) return m_pm.front();
if (a >= oN) return m_pm.back();
if (!m_hard && a >= o0 && b <= oN) {
// Same-segment fast path: a linear ramp averages to its midpoint value.
size_t lo = 0, hi = n - 1;
while (hi - lo > 1) { const size_t mid = (lo + hi) >> 1; if (stops[mid].offset <= a) lo = mid; else hi = mid; }
if (b <= stops[hi].offset) {
const float w = stops[hi].offset - stops[lo].offset;
const float u = ((a + b) * 0.5f - stops[lo].offset) / w;
return m_pm[lo] + (m_pm[hi] - m_pm[lo]) * u;
}
}
return (integral(b) - integral(a)) * (1.0f / (b - a));
}
// F(t) = integral of the premultiplied ramp from 0 to t (constant tails).
PM integral(float t) const {
const size_t n = m_pm.size();
const float o0 = stops.front().offset, oN = stops.back().offset;
if (t <= o0) return m_pm.front() * t;
const PM base = m_pm.front() * o0;
if (t >= oN) return base + m_total + m_pm.back() * (t - oN);
size_t lo = 0, hi = n - 1;                   // off[lo] <= t < off[hi]
while (hi - lo > 1) { const size_t mid = (lo + hi) >> 1; if (stops[mid].offset <= t) lo = mid; else hi = mid; }
const float w = stops[hi].offset - stops[lo].offset;
const float u = (t - stops[lo].offset) / w;
const PM part = (m_pm[lo] + (m_pm[hi] - m_pm[lo]) * (u * 0.5f)) * (u * w);
return base + m_int[lo] + part;
}
void build() const {
const size_t n = stops.size();
m_pm.resize(n); m_hard = false;
for (size_t i = 0; i < n; ++i) {
const uint32_t c = stops[i].color; const float a = static_cast<float>(c >> 24), k = a * (1.0f / 255.0f);
m_pm[i] = PM{static_cast<float>(c & 255u) * k, static_cast<float>((c >> 8) & 255u) * k,
static_cast<float>((c >> 16) & 255u) * k, a};
if (i && stops[i].offset == stops[i - 1].offset) m_hard = true;
}
// Prefix integrals (trapezoids; zero-width hard-stop segments add nothing).
m_int.assign(n, PM{0.0f, 0.0f, 0.0f, 0.0f});
for (size_t i = 1; i < n; ++i) {
const float w = (stops[i].offset - stops[i - 1].offset) * 0.5f;
m_int[i] = m_int[i - 1] + (m_pm[i - 1] + m_pm[i]) * w;
}
m_total = n ? m_int[n - 1] : PM{0.0f, 0.0f, 0.0f, 0.0f};
m_lut.resize(LUT_SIZE + 1);
if (n) for (int i = 0; i <= LUT_SIZE; ++i) m_lut[i] = eval_pm(static_cast<float>(i) / LUT_SIZE);
m_lut_valid = true;
}
};
class LinearGradient : public Gradient {
public:
float x1, y1, x2, y2;
LinearGradient(float ax, float ay, float bx, float by) : x1(ax), y1(ay), x2(bx), y2(by) {}
bool affine_param(float& ka, float& kb, float& kc) const override {
const float dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
if (l2 < 1e-6f) { ka = kb = kc = 0.0f; return true; }
ka = dx / l2; kb = dy / l2; kc = -(x1 * ka + y1 * kb); return true;
}
float param(float gx, float gy) const override {
float ka, kb, kc; affine_param(ka, kb, kc); return ka * gx + kb * gy + kc;
}
bool param_grad(float, float, float, float& dx, float& dy) const override {
float kc; return affine_param(dx, dy, kc);
}
};
class RadialGradient : public Gradient {
public:
float cx, cy, r, fx, fy, fr;
RadialGradient(float acx, float acy, float ar, float afx, float afy, float afr = 0.0f)
: cx(acx), cy(acy), r(ar), fx(afx), fy(afy), fr(afr) {}
float param(float tx, float ty) const override {
constexpr float NaN = std::numeric_limits<float>::quiet_NaN();
if (r < 1e-6f && fr < 1e-6f) return 0.0f;
const float dx = tx - fx, dy = ty - fy, ddx = cx - fx, ddy = cy - fy, rd = r - fr;
const float A = rd * rd - (ddx * ddx + ddy * ddy);
const float B = 2.0f * (dx * ddx + dy * ddy + fr * rd);
const float C = fr * fr - (dx * dx + dy * dy);
float t1, t2;
if (std::fabs(A) < 1e-9f) {
if (std::fabs(B) < 1e-12f) return NaN;
t1 = t2 = -C / B;
} else {
const float disc = B * B - 4.0f * A * C;
if (disc < 0.0f) return NaN;                       // outside the cone
const float sq = std::sqrt(disc);
const float q = -0.5f * (B + (B >= 0.0f ? sq : -sq));
if (q == 0.0f) t1 = t2 = 0.0f; else { t1 = q / A; t2 = C / q; }
}
const bool ok1 = fr + t1 * rd >= 0.0f, ok2 = fr + t2 * rd >= 0.0f;
if (ok1 && ok2) return t1 > t2 ? t1 : t2;              // spec: larger t
if (ok1) return t1;
if (ok2) return t2;
return NaN;
}
// Implicit differentiation of A*t^2 + B*t + C = 0 (B,C depend on position):
// dt/dx = -(dB/dx * t + dC/dx) / (2A t + B) = 2(dx - ddx*t) / (2A t + B).
bool param_grad(float tx, float ty, float t, float& gx, float& gy) const override {
const float dx = tx - fx, dy = ty - fy, ddx = cx - fx, ddy = cy - fy, rd = r - fr;
const float A = rd * rd - (ddx * ddx + ddy * ddy);
const float B = 2.0f * (dx * ddx + dy * ddy + fr * rd);
const float D = 2.0f * A * t + B;
if (std::fabs(D) < 1e-9f) return false;
gx = 2.0f * (dx - ddx * t) / D;
gy = 2.0f * (dy - ddy * t) / D;
return true;
}
bool has_nan_domain() const override { return true; }
};
class ConicalGradient : public Gradient {
public:
float cx, cy, startAngle;
ConicalGradient(float acx, float acy, float aStart = 0.0f) : cx(acx), cy(acy), startAngle(aStart) {}
float param(float tx, float ty) const override {
const float t = (std::atan2(ty - cy, tx - cx) - startAngle) * 0.15915494309f;
return t - std::floor(t);
}
bool param_grad(float tx, float ty, float, float& gx, float& gy) const override {
const float dx = tx - cx, dy = ty - cy, d2 = dx * dx + dy * dy;
if (d2 < 1e-12f) return false;
const float k = 0.15915494309f / d2;
gx = -dy * k; gy = dx * k;
return true;
}
bool wraps() const override { return true; }
};
class Pattern;
class Canvas2D;
struct Paint {
enum Type { SOLID, GRADIENT, PATTERN };
Type type; uint32_t color; Gradient* gradient; Pattern* pattern;
Paint(uint32_t c) : type(SOLID), color(c), gradient(nullptr), pattern(nullptr) {}
Paint(Gradient* g) : type(GRADIENT), color(0), gradient(g), pattern(nullptr) {}
Paint(Pattern* p) : type(PATTERN), color(0), gradient(nullptr), pattern(p) {}
inline uint32_t get_color(float x, float y, float obj_x = 0.0f, float obj_y = 0.0f, float obj_w = 1.0f, float obj_h = 1.0f, int px = 0, int py = 0) const;
bool is_solid_opaque() const { return type == SOLID && (color >> 24) == 255; }
bool is_opaque() const { return type == SOLID ? (color >> 24) == 255 : (gradient && gradient->is_opaque()); }
inline bool is_visible() const;
};
class Pattern {
public:
enum class Units { UserSpaceOnUse, ObjectBoundingBox };
enum class ContentUnits { UserSpaceOnUse, ObjectBoundingBox };
struct Item {
const Shape2D* shape; Paint fill, stroke; const Image* image; const uint32_t* pixels;
int pix_w, pix_h; float x, y, w, h;
Item(const Shape2D* s, const Paint& f, const Paint& st)
: shape(s), fill(f), stroke(st), image(nullptr), pixels(nullptr), pix_w(0), pix_h(0), x(0), y(0), w(0), h(0) {}
Item(const Image* im, float ax, float ay, float aw, float ah)
: shape(nullptr), fill(rgba(0,0,0,0)), stroke(rgba(0,0,0,0)), image(im), pixels(nullptr), pix_w(0), pix_h(0), x(ax), y(ay), w(aw), h(ah) {}
Item(const uint32_t* px, int pw, int ph, float ax, float ay, float aw, float ah)
: shape(nullptr), fill(rgba(0,0,0,0)), stroke(rgba(0,0,0,0)), image(nullptr), pixels(px), pix_w(pw), pix_h(ph), x(ax), y(ay), w(aw), h(ah) {}
};
Image* image; float x, y, width, height; Transform transform;
Units units; ContentUnits content_units; bool repeat_x, repeat_y;
std::vector<Item> m_items;
mutable std::vector<uint32_t> m_buffer;
mutable int m_buf_w = 0, m_buf_h = 0;
mutable bool m_dirty = true;
mutable float m_last_obj_x = -1e30f, m_last_obj_y = -1e30f, m_last_obj_w = -1.0f, m_last_obj_h = -1.0f;
Pattern(Image* img, float w, float h, Units u = Units::UserSpaceOnUse, bool rx = true, bool ry = true)
: image(img), x(0), y(0), width(w), height(h), units(u), content_units(ContentUnits::UserSpaceOnUse), repeat_x(rx), repeat_y(ry) {}
Pattern(float w, float h, Units u = Units::UserSpaceOnUse, ContentUnits cu = ContentUnits::UserSpaceOnUse, bool rx = true, bool ry = true)
: image(nullptr), x(0), y(0), width(w), height(h), units(u), content_units(cu), repeat_x(rx), repeat_y(ry) {}
virtual ~Pattern() = default;
void set_transform(float a, float b, float c, float d, float e, float f) { transform.set_transform(a, b, c, d, e, f); }
Pattern& set_content_units(ContentUnits cu) { content_units = cu; m_dirty = true; return *this; }
ContentUnits get_content_units() const { return content_units; }
Pattern& add(const Shape2D& s, const Paint& f, const Paint& st = Paint(rgba(0,0,0,0))) { m_items.emplace_back(&s, f, st); m_dirty = true; return *this; }
Pattern& add(const Image& img, float ix, float iy, float iw = 0.0f, float ih = 0.0f) { m_items.emplace_back(&img, ix, iy, iw, ih); m_dirty = true; return *this; }
Pattern& add(const uint32_t* px, int pw, int ph, float ix, float iy, float iw = 0.0f, float ih = 0.0f) {
if (px && pw > 0 && ph > 0) m_items.emplace_back(px, pw, ph, ix, iy, iw, ih);
m_dirty = true; return *this;
}
inline Pattern& add(const Canvas2D& c, float ix = 0.0f, float iy = 0.0f, float iw = 0.0f, float ih = 0.0f);
Pattern& clear() { m_items.clear(); m_dirty = true; return *this; }
bool empty() const { return m_items.empty() && !image; }
void prepare(float obj_x, float obj_y, float obj_w, float obj_h) const;
// Bilinear (premultiplied) tile sampling. Repeating tiles wrap at the seam so
// the filter is seamless; non-repeating tiles clamp. This removes the blocky
// nearest-neighbour pixels when a small tile buffer is scaled up.
static inline uint32_t bilinear_premul(const uint32_t* buf, int bw, int bh, float u, float v, bool rx, bool ry) {
float sx = u * bw - 0.5f, sy = v * bh - 0.5f;
int x0 = (int)std::floor(sx), y0 = (int)std::floor(sy);
const float fx = sx - x0, fy = sy - y0;
int x1 = x0 + 1, y1 = y0 + 1;
if (rx) { x0 = ((x0 % bw) + bw) % bw; x1 = ((x1 % bw) + bw) % bw; }
else { x0 = std::max(0, std::min(bw - 1, x0)); x1 = std::max(0, std::min(bw - 1, x1)); }
if (ry) { y0 = ((y0 % bh) + bh) % bh; y1 = ((y1 % bh) + bh) % bh; }
else { y0 = std::max(0, std::min(bh - 1, y0)); y1 = std::max(0, std::min(bh - 1, y1)); }
auto pm = [](uint32_t c, float* o) {
const float a = (c >> 24) * (1.0f / 255.0f);
o[0] = (c & 0xFF) * a; o[1] = ((c >> 8) & 0xFF) * a; o[2] = ((c >> 16) & 0xFF) * a; o[3] = (float)(c >> 24);
};
float p00[4], p10[4], p01[4], p11[4], o[4];
pm(buf[y0 * bw + x0], p00); pm(buf[y0 * bw + x1], p10);
pm(buf[y1 * bw + x0], p01); pm(buf[y1 * bw + x1], p11);
for (int k = 0; k < 4; ++k) {
const float top = p00[k] + (p10[k] - p00[k]) * fx;
const float bot = p01[k] + (p11[k] - p01[k]) * fx;
o[k] = top + (bot - top) * fy;
}
const float inv = (o[3] > 1e-6f) ? (255.0f / o[3]) : 0.0f;
auto q = [&](float val) -> uint32_t { val *= inv; if (val <= 0.0f) return 0u; if (val >= 255.0f) return 255u; return (uint32_t)(val + 0.5f); };
uint32_t ai = (uint32_t)(o[3] + 0.5f); if (ai > 255u) ai = 255u;
return (ai << 24) | (q(o[2]) << 16) | (q(o[1]) << 8) | q(o[0]);
}
uint32_t get_color(float px, float py, float obj_x = 0.0f, float obj_y = 0.0f, float obj_w = 1.0f, float obj_h = 1.0f) const {
prepare(obj_x, obj_y, obj_w, obj_h);
if (!image && m_items.empty()) return 0;
float tx = px, ty = py;
const Transform pinv = transform.inverse(); pinv.apply(tx, ty);
if (units == Units::ObjectBoundingBox) {
tx = (tx - obj_x) / (obj_w > 0 ? obj_w : 1.0f); ty = (ty - obj_y) / (obj_h > 0 ? obj_h : 1.0f);
} else { tx -= x; ty -= y; }
if (repeat_x) { tx = std::fmod(tx, width); if (tx < 0) tx += width; }
if (repeat_y) { ty = std::fmod(ty, height); if (ty < 0) ty += height; }
if (!repeat_x && (tx < 0 || tx >= width)) return 0;
if (!repeat_y && (ty < 0 || ty >= height)) return 0;
if (m_buf_w > 0 && m_buf_h > 0 && !m_buffer.empty()) {
return bilinear_premul(m_buffer.data(), m_buf_w, m_buf_h, tx / width, ty / height, repeat_x, repeat_y);
}
if (!image || image->getWidth() <= 0 || image->getHeight() <= 0) return 0;
// Image-only tile: bilinear directly on the source bytes (premultiplied).
const int iw = image->getWidth(), ih = image->getHeight(), ch = image->getChannels();
const uint8_t* src = image->getData(); const size_t stride = (size_t)iw * ch;
float sx = (tx / width) * iw - 0.5f, sy = (ty / height) * ih - 0.5f;
int x0 = (int)std::floor(sx), y0 = (int)std::floor(sy);
const float fx = sx - x0, fy = sy - y0;
int x1 = x0 + 1, y1 = y0 + 1;
if (repeat_x) { x0 = ((x0 % iw) + iw) % iw; x1 = ((x1 % iw) + iw) % iw; }
else { x0 = std::max(0, std::min(iw - 1, x0)); x1 = std::max(0, std::min(iw - 1, x1)); }
if (repeat_y) { y0 = ((y0 % ih) + ih) % ih; y1 = ((y1 % ih) + ih) % ih; }
else { y0 = std::max(0, std::min(ih - 1, y0)); y1 = std::max(0, std::min(ih - 1, y1)); }
auto fetch = [&](int X, int Y, float* o) {
const uint8_t* p = src + (size_t)Y * stride + (size_t)X * ch;
const float r = p[0], g = ch > 2 ? p[1] : r, b = ch > 2 ? p[2] : r;
const float a = (ch == 4) ? p[3] : (ch == 2 ? p[1] : 255.0f);
const float an = a * (1.0f / 255.0f);
o[0] = r * an; o[1] = g * an; o[2] = b * an; o[3] = a;
};
float p00[4], p10[4], p01[4], p11[4], o[4];
fetch(x0, y0, p00); fetch(x1, y0, p10); fetch(x0, y1, p01); fetch(x1, y1, p11);
for (int k = 0; k < 4; ++k) {
const float top = p00[k] + (p10[k] - p00[k]) * fx;
const float bot = p01[k] + (p11[k] - p01[k]) * fx;
o[k] = top + (bot - top) * fy;
}
const float inv = (o[3] > 1e-6f) ? (255.0f / o[3]) : 0.0f;
auto q = [&](float val) -> uint32_t { val *= inv; if (val <= 0.0f) return 0u; if (val >= 255.0f) return 255u; return (uint32_t)(val + 0.5f); };
uint32_t ai = (uint32_t)(o[3] + 0.5f); if (ai > 255u) ai = 255u;
return (ai << 24) | (q(o[2]) << 16) | (q(o[1]) << 8) | q(o[0]);
}
bool is_opaque() const { return false; }
};
inline uint32_t Paint::get_color(float x, float y, float obj_x, float obj_y, float obj_w, float obj_h, int px, int py) const {
if (type == SOLID) return color;
if (type == GRADIENT) return gradient ? gradient->get_color(x, y, px, py) : 0u;
if (type == PATTERN) return pattern ? pattern->get_color(x, y, obj_x, obj_y, obj_w, obj_h) : 0u;
return 0u;
}
inline bool Paint::is_visible() const {
if (type == SOLID) return (color >> 24) > 0;
if (type == GRADIENT) return gradient != nullptr && !gradient->stops.empty();
if (type == PATTERN) return pattern != nullptr && !pattern->empty();
return false;
}
// ======================================================================
// 3. SVG 2 MASKING
// ======================================================================
class Mask {
public:
enum class Type { Luminance, Alpha, MatchSource };
enum class Units { UserSpaceOnUse, ObjectBoundingBox };
enum class ColorSpace { SRGB, LinearRGB };
struct Item {
const Shape2D* shape; Paint fill, stroke; const Image* image; const uint32_t* pixels;
int pix_w, pix_h; float x, y, w, h;
Item(const Shape2D* s, const Paint& f, const Paint& st) : shape(s), fill(f), stroke(st), image(nullptr), pixels(nullptr), pix_w(0), pix_h(0), x(0), y(0), w(0), h(0) {}
Item(const Image* im, float ax, float ay, float aw, float ah) : shape(nullptr), fill(rgba(0,0,0,0)), stroke(rgba(0,0,0,0)), image(im), pixels(nullptr), pix_w(0), pix_h(0), x(ax), y(ay), w(aw), h(ah) {}
Item(const uint32_t* px, int pw, int ph, float ax, float ay, float aw, float ah) : shape(nullptr), fill(rgba(0,0,0,0)), stroke(rgba(0,0,0,0)), image(nullptr), pixels(px), pix_w(pw), pix_h(ph), x(ax), y(ay), w(aw), h(ah) {}
};
Mask() = default;
Mask& set_type(Type t) { m_type = t; return *this; }
Type type() const { return m_type; }
Type effective_type() const {
if (m_type != Type::MatchSource) return m_type;
for (const auto& it : m_items) if (it.shape) return Type::Luminance;
return m_items.empty() ? Type::Luminance : Type::Alpha;
}
Mask& set_units(Units u) { m_units = u; return *this; }
Units units() const { return m_units; }
Mask& set_content_units(Units u) { m_content_units = u; return *this; }
Units content_units() const { return m_content_units; }
Mask& set_region(float x, float y, float w, float h) { m_rx = x; m_ry = y; m_rw = w; m_rh = h; m_region_set = true; return *this; }
Mask& reset_region() { m_rx = -0.1f; m_ry = -0.1f; m_rw = 1.2f; m_rh = 1.2f; m_region_set = false; return *this; }
bool has_region() const { return m_region_set; }
float region_x() const { return m_rx; } float region_y() const { return m_ry; }
float region_w() const { return m_rw; } float region_h() const { return m_rh; }
Mask& set_transform(float a, float b, float c, float d, float e, float f) { m_transform.set_transform(a, b, c, d, e, f); return *this; }
Transform& transform() { return m_transform; }
const Transform& transform() const { return m_transform; }
Mask& set_color_space(ColorSpace cs) { m_cs = cs; if (cs == ColorSpace::LinearRGB && !m_lut_ready) build_luts(); return *this; }
ColorSpace color_space() const { return m_cs; }
Mask& add_shape(const Shape2D& s, const Paint& fill, const Paint& stroke = Paint(rgba(0,0,0,0))) { m_items.emplace_back(&s, fill, stroke); return *this; }
Mask& add_image(const Image& img, float x, float y, float w = 0.0f, float h = 0.0f) { m_items.emplace_back(&img, x, y, w, h); return *this; }
Mask& add_pixels(const uint32_t* px, int pw, int ph, float x, float y, float w = 0.0f, float h = 0.0f) {
if (px && pw > 0 && ph > 0) m_items.emplace_back(px, pw, ph, x, y, w, h); return *this;
}
Mask& add(const Shape2D& s, const Paint& fill, const Paint& stroke = Paint(rgba(0,0,0,0))) { return add_shape(s, fill, stroke); }
Mask& add(const Image& img, float x, float y, float w = 0.0f, float h = 0.0f) { return add_image(img, x, y, w, h); }
inline Mask& add(const Canvas2D& c, float x = 0.0f, float y = 0.0f, float w = 0.0f, float h = 0.0f);
Mask& clear() { m_items.clear(); return *this; }
bool empty() const { return m_items.empty(); }
size_t size() const { return m_items.size(); }
const std::vector<Item>& items() const { return m_items; }
inline uint8_t value(uint32_t c, Type t) const {
const uint32_t a = c >> 24; if (a == 0) return 0;
if (t == Type::Alpha) return static_cast<uint8_t>(a);
const uint32_t r = c & 0xFFu, g = (c >> 8) & 0xFFu, b = (c >> 16) & 0xFFu;
uint32_t l;
if (m_cs == ColorSpace::SRGB) { l = (13933u * r + 46871u * g + 4732u * b + 32768u) >> 16; }
else {
const float lin = m_s2l[r] * 0.2126f + m_s2l[g] * 0.7152f + m_s2l[b] * 0.0722f;
int idx = static_cast<int>(lin * 1023.0f + 0.5f);
if (idx < 0) idx = 0; else if (idx > 1023) idx = 1023;
l = static_cast<uint32_t>(m_l2s[idx] * 255.0f + 0.5f);
}
if (l > 255u) l = 255u;
return static_cast<uint8_t>((l * a + 127u) / 255u);
}
inline uint8_t value(uint32_t c) const { return value(c, effective_type()); }
private:
void build_luts() {
for (int i = 0; i < 256; ++i) {
const float v = static_cast<float>(i) / 255.0f;
m_s2l[i] = (v <= 0.04045f) ? (v / 12.92f) : std::pow((v + 0.055f) / 1.055f, 2.4f);
}
for (int i = 0; i < 1024; ++i) {
const float v = static_cast<float>(i) / 1023.0f;
m_l2s[i] = (v <= 0.0031308f) ? (v * 12.92f) : (1.055f * std::pow(v, 1.0f / 2.4f) - 0.055f);
}
m_lut_ready = true;
}
Type m_type = Type::Luminance; Units m_units = Units::ObjectBoundingBox; Units m_content_units = Units::UserSpaceOnUse;
float m_rx = -0.1f, m_ry = -0.1f, m_rw = 1.2f, m_rh = 1.2f; bool m_region_set = false;
Transform m_transform; ColorSpace m_cs = ColorSpace::SRGB; std::vector<Item> m_items;
float m_s2l[256] = {0.0f}; float m_l2s[1024] = {0.0f}; bool m_lut_ready = false;
};
class ClipPath {
public:
enum class Units { UserSpaceOnUse, ObjectBoundingBox };
enum class Rule { NonZero, EvenOdd };
struct Item { const Shape2D* shape; Rule rule; Item(const Shape2D* s, Rule r) : shape(s), rule(r) {} };
ClipPath() = default;
ClipPath& set_units(Units u) { m_units = u; return *this; }
Units units() const { return m_units; }
ClipPath& set_transform(float a, float b, float c, float d, float e, float f) { m_transform.set_transform(a, b, c, d, e, f); return *this; }
Transform& transform() { return m_transform; }
const Transform& transform() const { return m_transform; }
ClipPath& add(const Shape2D& s, Rule r = Rule::NonZero) { m_items.emplace_back(&s, r); return *this; }
ClipPath& add(Shape2D&&, Rule = Rule::NonZero) = delete;
ClipPath& add_shape(const Shape2D& s, Rule r = Rule::NonZero) { return add(s, r); }
ClipPath& add_shape(Shape2D&&, Rule = Rule::NonZero) = delete;
ClipPath& set_clip_path(ClipPath* p) { m_parent = p; return *this; }
ClipPath* clip_path() const { return m_parent; }
ClipPath& clear() { m_items.clear(); m_parent = nullptr; return *this; }
bool empty() const { return m_items.empty(); }
size_t size() const { return m_items.size(); }
const std::vector<Item>& items() const { return m_items; }
private:
Units m_units = Units::UserSpaceOnUse; Transform m_transform; ClipPath* m_parent = nullptr; std::vector<Item> m_items;
};
class Marker {
public:
enum class Units { StrokeWidth, UserSpaceOnUse };
enum class Orient { Auto, AutoStartReverse, Angle };
enum class Align { None, xMinYMin, xMinYMid, xMinYMax, xMidYMin, xMidYMid, xMidYMax, xMaxYMin, xMaxYMid, xMaxYMax };
enum class Fit { Meet, Slice };
enum class Context { None, Fill, Stroke };
struct Item { const Shape2D* shape; Paint fill, stroke; Context fill_from, stroke_from;
Item(const Shape2D* s, const Paint& f, const Paint& st, Context cf, Context cs) : shape(s), fill(f), stroke(st), fill_from(cf), stroke_from(cs) {} };
Marker() = default;
Marker& set_ref(float x, float y) { m_rx = x; m_ry = y; return *this; }
float ref_x() const { return m_rx; } float ref_y() const { return m_ry; }
Marker& set_size(float w, float h) { m_w = w; m_h = h; return *this; }
float marker_width() const { return m_w; } float marker_height() const { return m_h; }
Marker& set_units(Units u) { m_units = u; return *this; }
Units units() const { return m_units; }
Marker& set_orient_auto() { m_orient = Orient::Auto; m_angle = 0.0f; return *this; }
Marker& set_orient_auto_start_reverse() { m_orient = Orient::AutoStartReverse; m_angle = 0.0f; return *this; }
Marker& set_orient(float degrees) { m_orient = Orient::Angle; m_angle = degrees; return *this; }
Orient orient() const { return m_orient; } float orient_angle() const { return m_angle; }
Marker& set_view_box(float x, float y, float w, float h) { m_vb[0] = x; m_vb[1] = y; m_vb[2] = w; m_vb[3] = h; m_has_vb = true; return *this; }
Marker& clear_view_box() { m_has_vb = false; return *this; }
bool has_view_box() const { return m_has_vb; } const float* view_box() const { return m_vb; }
Marker& set_preserve_aspect_ratio(Align a, Fit f = Fit::Meet) { m_align = a; m_fit = f; return *this; }
Align align() const { return m_align; } Fit fit() const { return m_fit; }
Marker& set_overflow_visible(bool v = true) { m_overflow_visible = v; return *this; }
bool overflow_visible() const { return m_overflow_visible; }
Marker& add(const Shape2D& s, const Paint& fill, const Paint& stroke = Paint(rgba(0,0,0,0))) {
m_items.emplace_back(&s, fill, stroke, Context::None, Context::None); return *this;
}
Marker& add(Shape2D&&, const Paint&, const Paint& = Paint(rgba(0,0,0,0))) = delete;
Marker& add_shape(const Shape2D& s, const Paint& fill, const Paint& stroke = Paint(rgba(0,0,0,0))) { return add(s, fill, stroke); }
Marker& add_context(const Shape2D& s, Context fill_from = Context::Stroke, Context stroke_from = Context::None) {
m_items.emplace_back(&s, Paint(rgba(0,0,0,0)), Paint(rgba(0,0,0,0)), fill_from, stroke_from); return *this;
}
Marker& add_context(Shape2D&&, Context = Context::Stroke, Context = Context::None) = delete;
Marker& clear() { m_items.clear(); return *this; }
bool empty() const { return m_items.empty(); }
size_t size() const { return m_items.size(); }
const std::vector<Item>& items() const { return m_items; }
private:
float m_rx = 0.0f, m_ry = 0.0f; float m_w = 3.0f, m_h = 3.0f; Units m_units = Units::StrokeWidth;
Orient m_orient = Orient::Angle; float m_angle = 0.0f; float m_vb[4] = {0.0f, 0.0f, 0.0f, 0.0f}; bool m_has_vb = false;
Align m_align = Align::xMidYMid; Fit m_fit = Fit::Meet; bool m_overflow_visible = false; std::vector<Item> m_items;
};
class Filter {
public:
enum class Units { UserSpaceOnUse, ObjectBoundingBox };
enum class ColorSpace { SRGB, LinearRGB };
struct Primitive {
enum class Type { GaussianBlur, ColorMatrix, DropShadow };
Type type = Type::GaussianBlur;
float std_x = 0.0f, std_y = 0.0f; float dx = 0.0f, dy = 0.0f; uint32_t color = 0;
float m[20] = {1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0};
};
Filter() = default;
Filter& gaussian_blur(float std_dev) { return gaussian_blur(std_dev, std_dev); }
Filter& gaussian_blur(float std_x, float std_y) {
Primitive p; p.type = Primitive::Type::GaussianBlur;
p.std_x = (std_x > 0.0f) ? std_x : 0.0f; p.std_y = (std_y > 0.0f) ? std_y : 0.0f;
m_prims.push_back(p); return *this;
}
Filter& color_matrix(const float m[20]) {
Primitive p; p.type = Primitive::Type::ColorMatrix;
for (int i = 0; i < 20; ++i) p.m[i] = m[i]; m_prims.push_back(p); return *this;
}
Filter& color_matrix(std::initializer_list<float> m) {
if (m.size() == 20) { float a[20]; int i = 0; for (float v : m) a[i++] = v; color_matrix(a); } return *this;
}
Filter& saturate(float s) {
if (!(s >= 0.0f)) s = 0.0f;
const float m[20] = {0.213f + 0.787f * s, 0.715f - 0.715f * s, 0.072f - 0.072f * s, 0, 0,
0.213f - 0.213f * s, 0.715f + 0.285f * s, 0.072f - 0.072f * s, 0, 0,
0.213f - 0.213f * s, 0.715f - 0.715f * s, 0.072f + 0.928f * s, 0, 0, 0, 0, 0, 1, 0};
return color_matrix(m);
}
Filter& hue_rotate(float degrees) {
const float a = degrees * 0.01745329251994329577f; const float c = std::cos(a), s = std::sin(a);
const float m[20] = {0.213f + c * 0.787f - s * 0.213f, 0.715f - c * 0.715f - s * 0.715f, 0.072f - c * 0.072f + s * 0.928f, 0, 0,
0.213f - c * 0.213f + s * 0.143f, 0.715f + c * 0.285f + s * 0.140f, 0.072f - c * 0.072f - s * 0.283f, 0, 0,
0.213f - c * 0.213f - s * 0.787f, 0.715f - c * 0.715f + s * 0.715f, 0.072f + c * 0.928f + s * 0.072f, 0, 0, 0, 0, 0, 1, 0};
return color_matrix(m);
}
Filter& luminance_to_alpha() {
const float m[20] = {0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0.2126f, 0.7152f, 0.0722f, 0, 0}; return color_matrix(m);
}
Filter& drop_shadow(float dx, float dy, float std_dev, uint32_t color) { return drop_shadow(dx, dy, std_dev, std_dev, color); }
Filter& drop_shadow(float dx, float dy, float std_x, float std_y, uint32_t color) {
Primitive p; p.type = Primitive::Type::DropShadow; p.dx = dx; p.dy = dy;
p.std_x = (std_x > 0.0f) ? std_x : 0.0f; p.std_y = (std_y > 0.0f) ? std_y : 0.0f; p.color = color;
m_prims.push_back(p); return *this;
}
Filter& set_region(float x, float y, float w, float h) { m_rx = x; m_ry = y; m_rw = w; m_rh = h; m_region_set = true; return *this; }
Filter& reset_region() { m_rx = -0.1f; m_ry = -0.1f; m_rw = 1.2f; m_rh = 1.2f; m_region_set = false; return *this; }
bool has_region() const { return m_region_set; }
float region_x() const { return m_rx; } float region_y() const { return m_ry; }
float region_w() const { return m_rw; } float region_h() const { return m_rh; }
Filter& set_units(Units u) { m_units = u; return *this; }
Units units() const { return m_units; }
Filter& set_color_space(ColorSpace cs) { m_cs = cs; return *this; }
ColorSpace color_space() const { return m_cs; }
Filter& clear() { m_prims.clear(); return *this; }
bool empty() const { return m_prims.empty(); }
size_t size() const { return m_prims.size(); }
const std::vector<Primitive>& primitives() const { return m_prims; }
void apply(uint32_t* pixels, int w, int h) const;
private:
std::vector<Primitive> m_prims; Units m_units = Units::ObjectBoundingBox; ColorSpace m_cs = ColorSpace::SRGB;
float m_rx = -0.1f, m_ry = -0.1f, m_rw = 1.2f, m_rh = 1.2f; bool m_region_set = false;
};
#endif // CANVAS2D_STYLES_HPP