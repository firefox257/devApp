// ./path2d.hpp
#ifndef PATH2D_HPP
#define PATH2D_HPP
#include <cstdint>
#include <cstdlib>
#include <cmath>
#include <algorithm>
#include <vector>
#include <utility>
class Path2D {
	public:
	struct Command {
		int type; // 0: mt, 1: lt, 2: qt, 3: ct, 4: close, 5: at (canvas-style arc)
		float x1, y1, x2, y2, x3, y3;
	};
	std::vector<Command> commands;
	float current_x = 0, current_y = 0;
	float start_x = 0, start_y = 0;
	bool has_start = false;
	// SVG path normalization state (requirement 1.3):
	//  - H/h, V/v are normalized to absolute L at build time.
	//  - S/s, T/t are normalized to full C/Q by reflecting the previous C/S (or
	//    Q/T) control point about the current point.
	//  - A/a (SVG elliptical arc) is normalized to <=90-degree cubic segments.
	// The stored command stream therefore only ever contains types 0-5, so the
	// rasterizer / flattener / clip-bounds code needs no awareness of the new
	// SVG commands.
	float last_cubic_x = 0, last_cubic_y = 0;
	float last_quad_x = 0, last_quad_y = 0;
	bool has_cubic_ctrl = false, has_quad_ctrl = false;
	Path2D& mt(float x, float y) {
		commands.push_back({0, x, y, 0, 0, 0, 0});
		current_x = start_x = x; current_y = start_y = y; has_start = true;
		has_cubic_ctrl = has_quad_ctrl = false;
		return *this;
	}
	Path2D& lt(float x, float y) {
		commands.push_back({1, x, y, 0, 0, 0, 0});
		current_x = x; current_y = y;
		has_cubic_ctrl = has_quad_ctrl = false;
		return *this;
	}
	// SVG H / h: horizontal lineto (y stays at the current point).
	Path2D& ht(float x) { return lt(x, current_y); }
	Path2D& htr(float dx) { return lt(current_x + dx, current_y); }
	// SVG V / v: vertical lineto (x stays at the current point).
	Path2D& vt(float y) { return lt(current_x, y); }
	Path2D& vtr(float dy) { return lt(current_x, current_y + dy); }
	Path2D& qt(float cx, float cy, float x, float y) {
		commands.push_back({2, cx, cy, x, y, 0, 0});
		current_x = x; current_y = y;
		last_quad_x = cx; last_quad_y = cy;
		has_quad_ctrl = true; has_cubic_ctrl = false;
		return *this;
	}
	// SVG T / t: smooth quadratic. Control point = reflection of the previous
	// Q/T control point about the current point; if the previous command was not
	// Q/T the control point coincides with the current point.
	Path2D& tt(float x, float y) {
		const float cx = has_quad_ctrl ? 2.0f * current_x - last_quad_x : current_x;
		const float cy = has_quad_ctrl ? 2.0f * current_y - last_quad_y : current_y;
		return qt(cx, cy, x, y);
	}
	Path2D& ttr(float dx, float dy) { return tt(current_x + dx, current_y + dy); }
	Path2D& ct(float cx1, float cy1, float cx2, float cy2, float x, float y) {
		commands.push_back({3, cx1, cy1, cx2, cy2, x, y});
		current_x = x; current_y = y;
		last_cubic_x = cx2; last_cubic_y = cy2;
		has_cubic_ctrl = true; has_quad_ctrl = false;
		return *this;
	}
	// SVG S / s: smooth cubic. First control point = reflection of the previous
	// C/S second control point about the current point (or the current point).
	Path2D& st(float cx2, float cy2, float x, float y) {
		const float cx1 = has_cubic_ctrl ? 2.0f * current_x - last_cubic_x : current_x;
		const float cy1 = has_cubic_ctrl ? 2.0f * current_y - last_cubic_y : current_y;
		return ct(cx1, cy1, cx2, cy2, x, y);
	}
	Path2D& str(float dcx2, float dcy2, float dx, float dy) {
		return st(current_x + dcx2, current_y + dcy2, current_x + dx, current_y + dy);
	}
	// Canvas-style arc (cx, cy, radius, start_angle, end_angle, ccw). Kept for
	// backward compatibility; the SVG elliptical arc is et()/etr() (alias a()).
	Path2D& at(float cx, float cy, float radius, float start_angle, float end_angle, bool counterclockwise) {
		commands.push_back({5, cx, cy, radius, start_angle, end_angle, counterclockwise ? 1.0f : 0.0f});
		current_x = cx + radius * std::cos(end_angle);
		current_y = cy + radius * std::sin(end_angle);
		has_cubic_ctrl = has_quad_ctrl = false;
		return *this;
	}
	// SVG A / a: elliptical arc, endpoint parameterization
	// (rx, ry, x-axis-rotation in degrees, large-arc-flag, sweep-flag, x, y).
	// Converted to <=90-degree cubic Bezier segments (SVG F.6.4-F.6.6):
	//  - coincident endpoints -> no-op, zero/non-finite radii -> straight line
	//  - out-of-range radii are scaled up uniformly (F.6.6)
	//  - max radial error ~2.7e-4 * r, below the flattener's 0.05px tolerance
	Path2D& et(float rx, float ry, float x_rotation_deg, bool large_arc, bool sweep, float x, float y) {
		const float x0 = current_x, y0 = current_y;
		if (!std::isfinite(rx) || !std::isfinite(ry) || !std::isfinite(x_rotation_deg) ||
			!std::isfinite(x) || !std::isfinite(y)) return *this;
		if (x == x0 && y == y0) return *this;              // coincident endpoints (F.6.2)
		rx = std::fabs(rx); ry = std::fabs(ry);
		if (rx < 1e-6f || ry < 1e-6f) return lt(x, y);     // degenerate radii -> line (F.6.2)
		constexpr float PI = 3.14159265358979323846f, TWO_PI = 6.28318530717958647692f;
		const float phi = x_rotation_deg * (PI / 180.0f);
		const float cp = std::cos(phi), sp = std::sin(phi);
		// F.6.5.1: endpoint -> center parameterization.
		const float hx = (x0 - x) * 0.5f, hy = (y0 - y) * 0.5f;
		const float x1p = cp * hx + sp * hy, y1p = -sp * hx + cp * hy;
		float rx2 = rx * rx, ry2 = ry * ry;
		const float x1p2 = x1p * x1p, y1p2 = y1p * y1p;
		const float lam = x1p2 / rx2 + y1p2 / ry2;         // F.6.6 radii correction
		if (lam > 1.0f) { const float k = std::sqrt(lam); rx *= k; ry *= k; rx2 = rx * rx; ry2 = ry * ry; }
		const float den = rx2 * y1p2 + ry2 * x1p2;
		float num = rx2 * ry2 - den;
		if (num < 0.0f) num = 0.0f;
		float co = (den > 0.0f) ? std::sqrt(num / den) : 0.0f;
		if (large_arc == sweep) co = -co;
		const float cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
		const float cx = cp * cxp - sp * cyp + (x0 + x) * 0.5f;
		const float cy = sp * cxp + cp * cyp + (y0 + y) * 0.5f;
		// F.6.5.3: start angle and sweep extent.
		const float ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry;
		const float vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
		const float theta = std::atan2(uy, ux);
		float delta = std::atan2(ux * vy - uy * vx, ux * vx + uy * vy);
		if (!sweep && delta > 0.0f) delta -= TWO_PI;
		else if (sweep && delta < 0.0f) delta += TWO_PI;
		if (std::fabs(delta) < 1e-10f) return lt(x, y);
		// Split into <=90-degree cubic segments; k = 4/3 * tan(d/4).
		const int segs = std::max(1, static_cast<int>(std::ceil(std::fabs(delta) / (PI * 0.5f + 1e-6f))));
		const float d = delta / segs;
		const float k = (4.0f / 3.0f) * std::tan(d * 0.25f);
		float t1 = theta, ex = x0, ey = y0;
		for (int i = 0; i < segs; ++i) {
			const float t2 = t1 + d;
			const float c1 = std::cos(t1), s1 = std::sin(t1);
			const float c2 = std::cos(t2), s2 = std::sin(t2);
			const float d1x = -cp * rx * s1 - sp * ry * c1, d1y = -sp * rx * s1 + cp * ry * c1;
			const float d2x = -cp * rx * s2 - sp * ry * c2, d2y = -sp * rx * s2 + cp * ry * c2;
			float px = cx + cp * rx * c2 - sp * ry * s2;
			float py = cy + sp * rx * c2 + cp * ry * s2;
			if (i == segs - 1) { px = x; py = y; }             // land exactly on the endpoint
			ct(ex + k * d1x, ey + k * d1y, px - k * d2x, py - k * d2y, px, py);
			ex = px; ey = py; t1 = t2;
		}
		has_cubic_ctrl = has_quad_ctrl = false;            // A breaks S/T reflection
		return *this;
	}
	Path2D& etr(float rx, float ry, float x_rotation_deg, bool large_arc, bool sweep, float dx, float dy) {
		return et(rx, ry, x_rotation_deg, large_arc, sweep, current_x + dx, current_y + dy);
	}
	Path2D& close() {
		commands.push_back({4, start_x, start_y, 0, 0, 0, 0});
		current_x = start_x; current_y = start_y;
		has_cubic_ctrl = has_quad_ctrl = false;
		return *this;
	}
	Path2D& mtr(float dx, float dy) { return mt(current_x + dx, current_y + dy); }
	Path2D& ltr(float dx, float dy) { return lt(current_x + dx, current_y + dy); }
	Path2D& qtr(float dcx, float dcy, float dx, float dy) { return qt(current_x + dcx, current_y + dcy, current_x + dx, current_y + dy); }
	Path2D& ctr(float dcx1, float dcy1, float dcx2, float dcy2, float dx, float dy) { return ct(current_x + dcx1, current_y + dcy1, current_x + dcx2, current_y + dcy2, current_x + dx, current_y + dy); }
	// Alias names forward to the primitives. Single letters match SVG commands:
	// h/v = horizontal/vertical, s/t = smooth cubic/quadratic, a = elliptical arc.
	#define P2D_ALIAS(alias, real) template<class... V> Path2D& alias(V... v) { return real(v...); }
	P2D_ALIAS(move_to, mt) P2D_ALIAS(line_to, lt) P2D_ALIAS(quadratic_curve_to, qt)
	P2D_ALIAS(cubic_curve_to, ct) P2D_ALIAS(close_path, close)
	P2D_ALIAS(horizontal_line_to, ht) P2D_ALIAS(vertical_line_to, vt)
	P2D_ALIAS(smooth_quadratic_curve_to, tt) P2D_ALIAS(smooth_cubic_curve_to, st)
	P2D_ALIAS(elliptical_arc_to, et)
	P2D_ALIAS(q, qt) P2D_ALIAS(c, ct) P2D_ALIAS(l, lt)
	P2D_ALIAS(h, ht) P2D_ALIAS(v, vt) P2D_ALIAS(s, st) P2D_ALIAS(t, tt) P2D_ALIAS(a, et)
	#undef P2D_ALIAS
};
// Adaptive flattening: each curve gets just enough segments for ~TOL pixels of
// error, capped at max_steps (so callers' old "steps" argument is now an upper bound).
inline std::vector<std::vector<std::pair<float, float>>> flatten_path(const Path2D& path, int max_steps = 100) {
	using Pt = std::pair<float, float>;
	constexpr float TOL = 0.05f, TWO_PI = 6.28318530717958647692f;
	if (max_steps < 1) max_steps = 1;
	std::vector<std::vector<Pt>> out;
	std::vector<Pt> cur;
	float px = 0, py = 0, sx = 0, sy = 0;
	bool has = false;
	auto dd2 = [](float x, float y) { return x * x + y * y; };
	auto steps = [&](float d2, float k) {
		int n = static_cast<int>(std::ceil(std::sqrt(k * std::sqrt(d2) / TOL)));
		return n < 1 ? 1 : (n > max_steps ? max_steps : n);
	};
	for (const auto& c : path.commands) {
		switch (c.type) {
			case 0:
			if (!cur.empty()) { out.push_back(std::move(cur)); cur.clear(); }
			px = sx = c.x1; py = sy = c.y1;
			cur.push_back({px, py});
			has = true;
			break;
			case 1:
			cur.push_back({c.x1, c.y1});
			px = c.x1; py = c.y1; has = true;
			break;
			case 2: {
				const int n = steps(dd2(px - 2 * c.x1 + c.x2, py - 2 * c.y1 + c.y2), 0.25f);
				for (int i = 1; i <= n; ++i) {
					const float t = static_cast<float>(i) / n, u = 1.0f - t;
					cur.push_back({u * u * px + 2 * u * t * c.x1 + t * t * c.x2,
							u * u * py + 2 * u * t * c.y1 + t * t * c.y2});
				}
				px = c.x2; py = c.y2; has = true;
				break;
			}
			case 3: {
				const float d2 = std::max(dd2(px - 2 * c.x1 + c.x2, py - 2 * c.y1 + c.y2),
					dd2(c.x1 - 2 * c.x2 + c.x3, c.y1 - 2 * c.y2 + c.y3));
				const int n = steps(d2, 0.75f);
				for (int i = 1; i <= n; ++i) {
					const float t = static_cast<float>(i) / n, u = 1.0f - t;
					const float b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
					cur.push_back({b0 * px + b1 * c.x1 + b2 * c.x2 + b3 * c.x3,
							b0 * py + b1 * c.y1 + b2 * c.y2 + b3 * c.y3});
				}
				px = c.x3; py = c.y3; has = true;
				break;
			}
			case 5: {
				const float acx = c.x1, acy = c.y1, r = c.x2, a0 = c.y2, a1 = c.x3;
				const bool ccw = c.y3 >= 0.5f;
				const float asx = acx + r * std::cos(a0), asy = acy + r * std::sin(a0);
				if (dd2(px - acx, py - acy) < 0.25f) {
					sx = px = asx; sy = py = asy;
					if (!cur.empty()) cur.back() = {asx, asy}; else cur.push_back({asx, asy});
				}
				if (!has) { cur.push_back({asx, asy}); has = true; }
				const float diff = a1 - a0;
				const bool full = std::abs(std::abs(diff) - TWO_PI) < 0.0001f;
				float eff = diff;
				if (full) eff = ccw ? -TWO_PI : TWO_PI;
				else if (ccw) { while (eff > 0) eff -= TWO_PI; }
				else { while (eff < 0) eff += TWO_PI; }
				if (eff != 0.0f || full) {
					const float ar = std::abs(r);
					float da = 2.0f * std::acos(1.0f - std::min(1.0f, TOL / std::max(ar, 1e-6f)));
					if (da < 1e-4f) da = 1e-4f;
					const int n = std::max(4, static_cast<int>(std::ceil(std::abs(eff) / da)));
					const float step = eff / n;
					for (int i = 1; i <= n; ++i) {
						const float ang = a0 + i * step;
						cur.push_back({acx + r * std::cos(ang), acy + r * std::sin(ang)});
					}
					px = acx + r * std::cos(a1); py = acy + r * std::sin(a1);
				}
				break;
			}
			case 4:
			if (has && !cur.empty()) {
				if (dd2(cur.back().first - sx, cur.back().second - sy) > 0.25f) cur.push_back({sx, sy});
			}
			px = sx; py = sy; has = true;
			break;
		}
	}
	if (!cur.empty()) out.push_back(std::move(cur));
	return out;
}
#endif