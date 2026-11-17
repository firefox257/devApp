// ./shape2d.hpp
#ifndef SHAPE2D_HPP
#define SHAPE2D_HPP
#include <vector>
#include <utility>
#include <cmath>
#include <algorithm>
#include <initializer_list>
#include "path2d.hpp"
// SVG 2 fill-rule (winding rule) for the FILL pass. Strokes always use nonzero.
enum class FillRule { NonZero, EvenOdd };
class Shape2D : public Path2D {
public:
enum LineCap { CAP_BUTT = 0, CAP_ROUND = 1, CAP_SQUARE = 2 };
// SVG 2 stroke-linejoin: miter | miter-clip | round | bevel.
//   JOIN_MITER      - spike; collapses to a bevel when the miter limit is hit.
//   JOIN_MITER_CLIP - spike; CLIPPED at the miter limit instead of collapsing.
//                     The cut is a line perpendicular to the join bisector at
//                     miter_limit * line_width / 2 from the vertex, so the join
//                     keeps a flat tip and grows continuously with the limit
//                     (no bevel "pop" when animating an angle).
enum LineJoin { JOIN_MITER = 0, JOIN_ROUND = 1, JOIN_BEVEL = 2, JOIN_MITER_CLIP = 3 };
struct Edge { float y_min, y_max, x_at_ymin, inv_slope; int dir; };
// Precalculated geometry (fill outline / stroke outline)
mutable std::vector<std::vector<std::pair<float, float>>> fill_subpaths;
mutable std::vector<Edge> stroke_edges;
float line_width = 0.0f;
int line_cap = CAP_BUTT;
int line_join = JOIN_MITER;
float miter_limit = 4.0f;
// SVG 2 fill-rule. When fill_rule_set is false the shape inherits the canvas
// context rule (Canvas2D::fill_rule(), default NonZero). set_fill_rule() makes
// the shape override the context; clear_fill_rule() restores inheritance.
FillRule fill_rule = FillRule::NonZero;
bool fill_rule_set = false;
// SVG 2 stroke-dasharray / stroke-dashoffset (user-space units; affects stroke only, never the fill).
std::vector<float> dash_array;
float dash_offset = 0.0f;
mutable bool m_cache_valid = false;
Shape2D() = default;
Shape2D& set_line_width(float w) { line_width = w; m_cache_valid = false; return *this; }
Shape2D& set_line_cap(LineCap cap) { line_cap = cap; m_cache_valid = false; return *this; }
Shape2D& set_line_join(LineJoin join) { line_join = join; m_cache_valid = false; return *this; }
// SVG 2 stroke-miterlimit (>= 1). Used by JOIN_MITER (bevel fallback threshold)
// and JOIN_MITER_CLIP (clip distance = limit * line_width / 2).
Shape2D& set_miter_limit(float limit) { miter_limit = limit; m_cache_valid = false; return *this; }
// Fill rule is a rasterization-time choice (fill_subpaths are unchanged), so
// the compiled geometry cache stays valid.
Shape2D& set_fill_rule(FillRule rule) { fill_rule = rule; fill_rule_set = true; return *this; }
Shape2D& clear_fill_rule() { fill_rule = FillRule::NonZero; fill_rule_set = false; return *this; }
Shape2D& set_dash_array(const float* dashes, size_t count) {
dash_array.clear();
if (dashes && count) dash_array.assign(dashes, dashes + count);
m_cache_valid = false; return *this;
}
Shape2D& set_dash_array(const std::vector<float>& dashes) { dash_array = dashes; m_cache_valid = false; return *this; }
Shape2D& set_dash_array(std::initializer_list<float> dashes) { dash_array.assign(dashes.begin(), dashes.end()); m_cache_valid = false; return *this; }
Shape2D& set_dash_offset(float offset) { dash_offset = offset; m_cache_valid = false; return *this; }
Shape2D& clear_dash() { dash_array.clear(); dash_offset = 0.0f; m_cache_valid = false; return *this; }
// Every path-building method forwards to Path2D, invalidates the cache and keeps chaining on Shape2D.
// Includes the full SVG command set: M/m L/l H/h V/v C/c S/s Q/q T/t A/a Z
// (H/V/S/T/A are normalized to absolute M/L/Q/C inside Path2D at build time).
#define S2D_FWD(n) template<class... V> Shape2D& n(V... v) { Path2D::n(v...); m_cache_valid = false; return *this; }
S2D_FWD(mt) S2D_FWD(lt) S2D_FWD(qt) S2D_FWD(ct) S2D_FWD(at) S2D_FWD(close)
S2D_FWD(ht) S2D_FWD(vt) S2D_FWD(st) S2D_FWD(tt) S2D_FWD(et)
S2D_FWD(mtr) S2D_FWD(ltr) S2D_FWD(qtr) S2D_FWD(ctr)
S2D_FWD(htr) S2D_FWD(vtr) S2D_FWD(str) S2D_FWD(ttr) S2D_FWD(etr)
S2D_FWD(move_to) S2D_FWD(line_to) S2D_FWD(quadratic_curve_to) S2D_FWD(cubic_curve_to) S2D_FWD(close_path)
S2D_FWD(horizontal_line_to) S2D_FWD(vertical_line_to)
S2D_FWD(smooth_quadratic_curve_to) S2D_FWD(smooth_cubic_curve_to) S2D_FWD(elliptical_arc_to)
S2D_FWD(q) S2D_FWD(c) S2D_FWD(l) S2D_FWD(a) S2D_FWD(h) S2D_FWD(v) S2D_FWD(s) S2D_FWD(t)
#undef S2D_FWD
void compile(int curve_steps = 100) const {
if (m_cache_valid) return;
fill_subpaths = flatten_path(*this, curve_steps);
stroke_edges.clear();
if (line_width <= 0.0f || fill_subpaths.empty()) { m_cache_valid = true; return; }
// SVG 2 dash generator: converts the solid flattened outline into dash-only polylines
// for the stroke pass. The fill pass always keeps the solid outline.
std::vector<std::vector<std::pair<float, float>>> dashed;
const std::vector<std::vector<std::pair<float, float>>>* stroke_src = &fill_subpaths;
if (!dash_array.empty() && dash_stroke(fill_subpaths, dashed)) stroke_src = &dashed;
size_t total_pts = 0;
for (const auto& sp : *stroke_src) total_pts += sp.size();
stroke_edges.reserve(total_pts * 8);
const float r = line_width * 0.5f;
std::vector<std::pair<float, float>> pts;
std::vector<float> dirs;
auto add_edge = [&](float x1, float y1, float x2, float y2, int dir) {
if (y1 == y2) return;
if (y1 > y2) { std::swap(x1, x2); std::swap(y1, y2); dir = -dir; }
stroke_edges.push_back({y1, y2, x1, (x2 - x1) / (y2 - y1), dir});
};
auto add_poly = [&](const float* xy, int n, int orient = 0) {
if (n < 3) return;
if (orient == 0) {
float area = 0.0f;
for (int i = 0; i < n; ++i) {
int j = (i + 1 == n) ? 0 : i + 1;
area += xy[2 * i] * xy[2 * j + 1] - xy[2 * j] * xy[2 * i + 1];
}
if (std::abs(area) < 1e-9f) return;
orient = (area > 0.0f) ? 1 : -1;
}
for (int i = 0; i < n; ++i) {
int j = (i + 1 == n) ? 0 : i + 1;
add_edge(xy[2 * i], xy[2 * i + 1], xy[2 * j], xy[2 * j + 1], orient);
}
};
auto add_tri = [&](float ax, float ay, float bx, float by, float cx, float cy) {
const float p[6] = {ax, ay, bx, by, cx, cy};
add_poly(p, 3);
};
auto add_quad = [&](float ax, float ay, float bx, float by, float cx, float cy, float dx, float dy) {
const float p[8] = {ax, ay, bx, by, cx, cy, dx, dy};
add_poly(p, 4);
};
auto add_circle = [&](float cx, float cy, float rv) {
if (rv <= 0.0f) return;
int n = 8;
if (rv > 0.1f) {
float da = 2.0f * std::acos(1.0f - 0.1f / rv);
n = da > 1e-4f ? static_cast<int>(std::ceil(6.2831853f / da)) : 128;
}
n = std::min(128, std::max(8, n));
float p[256];
const float step = 6.28318530717958647692f / n;
const float cs = std::cos(step), sn = std::sin(step);
float x = rv, y = 0.0f;
for (int i = 0; i < n; ++i) {
p[2 * i] = cx + x;
p[2 * i + 1] = cy + y;
const float nx = x * cs - y * sn;
y = x * sn + y * cs;
x = nx;
}
add_poly(p, n, 1);
};
// One side of a join: the wedge vertex -> a -> (miter tip | clipped tip) -> b.
// 's' selects the side (+/- left normal), 'miter' enables the spike attempt.
auto join_side = [&](float px, float py, float u1x, float u1y, float u2x, float u2y, float rv, float s, bool miter) {
const float ax = px - u1y * rv * s, ay = py + u1x * rv * s;
const float bx = px - u2y * rv * s, by = py + u2x * rv * s;
if (miter) {
const float denom = u1x * u2y - u1y * u2x;
if (std::abs(denom) >= 1e-4f) {
const float t = ((bx - ax) * u2y - (by - ay) * u2x) / denom;
if (t >= 0.0f) {
const float mx = ax + t * u1x, my = ay + t * u1y;
// SVG requires stroke-miterlimit >= 1; clamp (NaN -> 1) so a bad limit
// can never cut into the stroke body itself.
const float lim = (miter_limit >= 1.0f) ? miter_limit : 1.0f;
// miterLength / stroke-width <= limit  <=>  |tip - vertex| <= limit * w/2
const float max_dist = lim * rv;
const float d2 = (mx - px) * (mx - px) + (my - py) * (my - py);
if (d2 <= max_dist * max_dist) { add_quad(px, py, ax, ay, mx, my, bx, by); return; }
if (line_join == JOIN_MITER_CLIP) {
// SVG 2 'miter-clip': keep the spike, cut it with the line perpendicular
// to the bisector of the two segments at max_dist from the vertex.
// bisector = normalize(n1 + n2) with n = left normal * side.
float bisx = -(u1y + u2y) * s, bisy = (u1x + u2x) * s;
const float bl = std::sqrt(bisx * bisx + bisy * bisy);
if (bl > 1e-6f) {                       // ~180-degree turn: no bisector
bisx /= bl; bisy /= bl;
// Sutherland-Hodgman clip of the miter quad against the half-plane
// dot(p - vertex, bisector) <= max_dist. Convex quad -> <= 5 vertices,
// i.e. the tip is replaced by a flat, AA-friendly cut face.
const float q[8] = {px, py, ax, ay, mx, my, bx, by};
float o[16]; int on = 0;
for (int i = 0; i < 4; ++i) {
const int j = (i + 1 == 4) ? 0 : i + 1;
const float c0x = q[2 * i], c0y = q[2 * i + 1];
const float c1x = q[2 * j], c1y = q[2 * j + 1];
const float d0 = (c0x - px) * bisx + (c0y - py) * bisy - max_dist;
const float d1 = (c1x - px) * bisx + (c1y - py) * bisy - max_dist;
if (d0 <= 0.0f) { o[2 * on] = c0x; o[2 * on + 1] = c0y; ++on; }
if ((d0 < 0.0f && d1 > 0.0f) || (d0 > 0.0f && d1 < 0.0f)) {
const float f = d0 / (d0 - d1);
o[2 * on] = c0x + (c1x - c0x) * f; o[2 * on + 1] = c0y + (c1y - c0y) * f; ++on;
}
}
if (on >= 3) { add_poly(o, on); return; }
}
}
}
}
}
add_tri(px, py, ax, ay, bx, by);       // bevel (also the miter fallback)
};
auto draw_join = [&](float px, float py, float u1x, float u1y, float u2x, float u2y, float rv) {
const float cross = u1x * u2y - u1y * u2x;
const float dot = u1x * u2x + u1y * u2y;
if (dot > 0.0f && rv * std::abs(cross) < 0.03f) return;
const bool gentle = dot > 0.7f;
const float outer = (cross > 0.0f) ? -1.0f : 1.0f;
if (line_join == JOIN_ROUND) {
if (gentle) {
const float sag = rv * (1.0f - std::sqrt((1.0f + dot) * 0.5f));
if (sag <= 0.1f) { join_side(px, py, u1x, u1y, u2x, u2y, rv, outer, false); return; }
}
add_circle(px, py, rv);
return;
}
const bool miter = (line_join == JOIN_MITER || line_join == JOIN_MITER_CLIP);
if (gentle) join_side(px, py, u1x, u1y, u2x, u2y, rv, outer, miter);
else {
join_side(px, py, u1x, u1y, u2x, u2y, rv, 1.0f, miter);
join_side(px, py, u1x, u1y, u2x, u2y, rv, -1.0f, miter);
}
};
auto draw_cap = [&](float px, float py, float ux, float uy, float rv, bool is_start) {
if (line_cap == CAP_BUTT) return;
if (line_cap == CAP_ROUND) { add_circle(px, py, rv); return; }
const float nx = -uy, ny = ux;
const float Lx = px + nx * rv, Ly = py + ny * rv;
const float Rx = px - nx * rv, Ry = py - ny * rv;
const float ex = is_start ? -ux * rv : ux * rv;
const float ey = is_start ? -uy * rv : uy * rv;
add_quad(Lx, Ly, Rx, Ry, Rx + ex, Ry + ey, Lx + ex, Ly + ey);
};
for (const auto& raw_pts : *stroke_src) {
if (raw_pts.size() < 2) continue;
pts.clear();
pts.push_back(raw_pts[0]);
for (size_t i = 1; i < raw_pts.size(); ++i) {
const float dx = raw_pts[i].first - pts.back().first;
const float dy = raw_pts[i].second - pts.back().second;
if (dx * dx + dy * dy > 1e-6f) pts.push_back(raw_pts[i]);
}
size_t N = pts.size();
if (N < 2) continue;
bool is_closed = false;
const float dxc = pts.front().first - pts.back().first;
const float dyc = pts.front().second - pts.back().second;
if (dxc * dxc + dyc * dyc < 1e-6f) { is_closed = true; N--; }
if (N < 2) continue;
const size_t seg_count = is_closed ? N : N - 1;
dirs.resize(seg_count * 2);
for (size_t i = 0; i < seg_count; ++i) {
const size_t j = (i + 1) % N;
const float x0 = pts[i].first, y0 = pts[i].second;
const float x1 = pts[j].first, y1 = pts[j].second;
const float dx = x1 - x0, dy = y1 - y0;
const float len2 = dx * dx + dy * dy;
if (len2 < 1e-8f) { dirs[2 * i] = 0.0f; dirs[2 * i + 1] = 0.0f; continue; }
const float inv = 1.0f / std::sqrt(len2);
const float ux = dx * inv, uy = dy * inv;
dirs[2 * i] = ux; dirs[2 * i + 1] = uy;
const float nx = -uy * r, ny = ux * r;
const float q[8] = {x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny};
add_poly(q, 4, -1);
}
for (size_t i = 0; i < N; ++i) {
if (is_closed || (i > 0 && i < N - 1)) {
const size_t in_seg = (i + N - 1) % N;
const float u1x = dirs[2 * in_seg], u1y = dirs[2 * in_seg + 1];
const float u2x = dirs[2 * i], u2y = dirs[2 * i + 1];
if ((u1x == 0.0f && u1y == 0.0f) || (u2x == 0.0f && u2y == 0.0f)) continue;
draw_join(pts[i].first, pts[i].second, u1x, u1y, u2x, u2y, r);
} else if (i == 0) {
const float ux = dirs[0], uy = dirs[1];
if (ux == 0.0f && uy == 0.0f) continue;
draw_cap(pts[0].first, pts[0].second, ux, uy, r, true);
} else {
const float ux = dirs[2 * (N - 2)], uy = dirs[2 * (N - 2) + 1];
if (ux == 0.0f && uy == 0.0f) continue;
draw_cap(pts[N - 1].first, pts[N - 1].second, ux, uy, r, false);
}
}
}
m_cache_valid = true;
}
private:
// ------------------------------------------------------------------
// SVG 2 dash generator (stroke-dasharray / stroke-dashoffset).
// Takes the solid flattened subpaths and emits polylines containing only
// the visible dash segments, which are then stroked as solid geometry.
// Rules implemented (SVG 2 / CSS strokes):
//  - odd-length arrays are duplicated to an even length ([5] -> [5,5])
//  - any negative/non-finite entry invalidates the whole array (solid)
//  - an all-zero array renders as a solid stroke
//  - dashoffset may be negative; it is taken modulo the pattern length
//  - the pattern restarts at the beginning of every subpath
//  - zero-length dashes render as dots for round/square caps (nothing for butt)
//  - each dash is an open polyline, so linecaps apply at every dash end and
//    linejoins apply at original vertices inside a dash
// Returns false when the pattern is invalid/none (caller keeps solid stroke).
// ------------------------------------------------------------------
bool dash_stroke(const std::vector<std::vector<std::pair<float, float>>>& src,
std::vector<std::vector<std::pair<float, float>>>& dst) const {
using Pt = std::pair<float, float>;
if (dash_array.empty()) return false;
for (float v : dash_array) if (!(v >= 0.0f) || !std::isfinite(v)) return false;
std::vector<float> pat = dash_array;
if (pat.size() & 1u) pat.insert(pat.end(), dash_array.begin(), dash_array.end());
float total = 0.0f;
for (float v : pat) total += v;
if (!(total > 0.0f)) return false;
float phase = std::fmod(dash_offset, total);
if (phase < 0.0f) phase += total;
if (!(phase >= 0.0f)) phase = 0.0f;   // NaN offset guard
const size_t np = pat.size();
// Resolve the starting period from the phase.
size_t pi0 = 0; float left0 = pat[0];
while (phase > 0.0f && phase >= left0) { phase -= left0; pi0 = (pi0 + 1) % np; left0 = pat[pi0]; }
left0 -= phase;
const float EPS = 1e-4f;
std::vector<float> cum;
std::vector<std::pair<float, float>> iv;
for (const auto& pts : src) {
const size_t n = pts.size();
if (n < 2) continue;
// Cumulative arc length along the subpath.
cum.assign(n, 0.0f);
for (size_t i = 1; i < n; ++i) {
const float dx = pts[i].first - pts[i - 1].first, dy = pts[i].second - pts[i - 1].second;
cum[i] = cum[i - 1] + std::sqrt(dx * dx + dy * dy);
}
const float len = cum[n - 1];
if (len <= EPS) continue;
// 1) Walk the dash pattern -> ON intervals [start,end] in arc length.
//    Zero-length ON periods become dot intervals (start == end).
iv.clear();
size_t pi = pi0; float left = left0; bool on = (pi0 % 2 == 0);
float d = 0.0f;
for (;;) {
if (on) {
const float e = (left >= len - d) ? len : d + left;
if (!iv.empty() && iv.back().second >= d - 1e-6f) iv.back().second = e;  // merge across zero gaps
else iv.push_back({d, e});
}
if (d + left >= len) break;
d += left;
pi = (pi + 1) % np; left = pat[pi]; on = !on;
}
// 2) Cut the polyline at the interval boundaries (monotone cursor).
size_t cursor = 0;
for (const auto& seg : iv) {
const float s = seg.first, e = seg.second;
while (cursor + 2 < n && cum[cursor + 1] <= s) ++cursor;
if (e - s <= EPS) {
// Zero-length dash: dot for round/square caps, nothing for butt.
if (line_cap == CAP_BUTT) continue;
size_t j = cursor;
while (j + 2 < n && cum[j + 1] <= s) ++j;
const float L = cum[j + 1] - cum[j];
float t = (L > 1e-12f) ? (s - cum[j]) / L : 0.0f;
if (t < 0.0f) t = 0.0f;
if (t > 1.0f) t = 1.0f;
const float px = pts[j].first + (pts[j + 1].first - pts[j].first) * t;
const float py = pts[j].second + (pts[j + 1].second - pts[j].second) * t;
float ux = pts[j + 1].first - pts[j].first, uy = pts[j + 1].second - pts[j].second;
const float ul = std::sqrt(ux * ux + uy * uy);
if (ul > 1e-12f) { ux /= ul; uy /= ul; } else { ux = 1.0f; uy = 0.0f; }
// Sub-pixel oriented seed segment: the cap geometry renders the dot.
dst.push_back({{px, py}, {px + ux * 0.02f, py + uy * 0.02f}});
continue;
}
std::vector<Pt> dash;
for (size_t j = cursor; j + 1 < n; ++j) {
const float a = cum[j], b = cum[j + 1];
if (b <= s) continue;
if (a >= e) break;
const float L = b - a;
if (L <= 1e-12f) continue;
float t0 = (s - a) / L; if (t0 < 0.0f) t0 = 0.0f;
float t1 = (e - a) / L; if (t1 > 1.0f) t1 = 1.0f;
if (dash.empty())
dash.push_back({pts[j].first + (pts[j + 1].first - pts[j].first) * t0,
pts[j].second + (pts[j + 1].second - pts[j].second) * t0});
dash.push_back({pts[j].first + (pts[j + 1].first - pts[j].first) * t1,
pts[j].second + (pts[j + 1].second - pts[j].second) * t1});
}
if (dash.size() >= 2) dst.push_back(std::move(dash));
}
}
return true;
}
};
#endif // SHAPE2D_HPP