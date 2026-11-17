// ./canvas2d.hpp
#ifndef CANVAS2D_HPP
#define CANVAS2D_HPP

#include <cstdint>
#include <cstdlib>
#include <cmath>
#include <algorithm>
#include <vector>
#include <utility>
#include <path2d.hpp>
#include "font.hpp"
#include "image.cpp"

constexpr uint32_t rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255) {
    return (static_cast<uint32_t>(a) << 24) |
           (static_cast<uint32_t>(b) << 16) |
           (static_cast<uint32_t>(g) << 8)  |
           static_cast<uint32_t>(r);
}

class Canvas2D {
public:
    enum LineCap { CAP_BUTT = 0, CAP_ROUND = 1, CAP_SQUARE = 2 };
    enum LineJoin { JOIN_MITER = 0, JOIN_ROUND = 1, JOIN_BEVEL = 2 };

private:
    int width;
    int height;
    uint32_t* buffer;
    uint32_t m_fill_style = rgba(0, 0, 0, 255);
    uint32_t m_stroke_style = rgba(0, 0, 0, 255);
    float m_line_width = 1.0f;
    Font* m_font = nullptr;

    LineCap m_line_cap = CAP_BUTT;
    LineJoin m_line_join = JOIN_MITER;
    float m_miter_limit = 4.0f;
    int m_stroke_curve_steps = 200;

    // Vertical sub-scanlines per pixel row (horizontal coverage is exact).
    // 16 = best quality, 8 = ~2x faster rasterising with slightly coarser
    // near-horizontal edges, 4 = fastest.
    static constexpr int AA_SUB = 16;

    // ---- Shared scanline rasteriser state (reused across calls, no per-call allocs) ----
    struct Edge { float y_min, y_max, x_at_ymin, inv_slope; int dir; };
    struct ActiveEdge { float y_max, x, dx; int dir; };
    std::vector<Edge> m_edges;
    std::vector<ActiveEdge> m_active;
    std::vector<float> m_partial, m_delta;
    std::vector<std::pair<float, float>> m_pts;
    std::vector<float> m_dirs;
    std::vector<int> m_xmap;

    inline uint32_t blendColors(uint32_t bg, uint32_t fg, float coverage) {
        if (coverage <= 0.0f) return bg;
        if (coverage > 1.0f) coverage = 1.0f;
        uint32_t a_fg = fg >> 24, a_bg = bg >> 24;
        uint32_t fa = (uint32_t)(a_fg * coverage + 0.5f);
        if (fa == 0) return bg;
        if (fa == 255 && a_fg == 255) return fg;
        if (a_bg == 255) {
            uint32_t inv_fa = 255 - fa;
            uint32_t r = (((fg & 0xFF) * fa) + ((bg & 0xFF) * inv_fa) + 127) / 255;
            uint32_t g = ((((fg >> 8) & 0xFF) * fa) + (((bg >> 8) & 0xFF) * inv_fa) + 127) / 255;
            uint32_t b = ((((fg >> 16) & 0xFF) * fa) + (((bg >> 16) & 0xFF) * inv_fa) + 127) / 255;
            return 0xFF000000 | (b << 16) | (g << 8) | r;
        }
        uint32_t outA = fa + ((a_bg * (255 - fa)) / 255);
        if (outA == 0) return 0;
        if (outA > 255) outA = 255;
        float f_fa = fa * (1.0f / 255.0f);
        float f_bgA = a_bg * (1.0f / 255.0f);
        float inv_f_fa = 1.0f - f_fa;
        float inv_outA = 255.0f / outA;
        uint32_t r = (uint32_t)(((fg & 0xFF) * f_fa + (bg & 0xFF) * f_bgA * inv_f_fa) * inv_outA);
        uint32_t g = (uint32_t)((((fg >> 8) & 0xFF) * f_fa + ((bg >> 8) & 0xFF) * f_bgA * inv_f_fa) * inv_outA);
        uint32_t b = (uint32_t)((((fg >> 16) & 0xFF) * f_fa + ((bg >> 16) & 0xFF) * f_bgA * inv_f_fa) * inv_outA);
        if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
        return (outA << 24) | (b << 16) | (g << 8) | r;
    }

    inline void put_pixel_aa(int x, int y, uint32_t color, float coverage) {
        if ((unsigned)x < (unsigned)width && (unsigned)y < (unsigned)height) {
            buffer[y * width + x] = blendColors(buffer[y * width + x], color, coverage);
        }
    }

    // ======================================================================
    // CORE SCANLINE RASTERISER
    // Active-edge-table based: edges are sorted once by y_min, then only the
    // edges crossing the current sub-scanline are visited (previously every
    // edge was tested on every sub-scanline). Output is blended straight into
    // the framebuffer, once per pixel, so no separate stroke mask is needed.
    // even_odd = true  -> fills (matches the previous fill behaviour)
    // even_odd = false -> non-zero winding (strokes: exact union of shapes)
    // ======================================================================
    inline void add_edge(float x1, float y1, float x2, float y2, int dir) {
        if (y1 == y2) return;
        if (y1 > y2) { std::swap(x1, x2); std::swap(y1, y2); dir = -dir; }
        m_edges.push_back({y1, y2, x1, (x2 - x1) / (y2 - y1), dir});
    }

    void raster_edges(uint32_t color, bool even_odd) {
        if (m_edges.empty()) return;

        std::sort(m_edges.begin(), m_edges.end(),
                  [](const Edge& a, const Edge& b) { return a.y_min < b.y_min; });

        float max_y = -1e9f;
        for (const auto& e : m_edges) if (e.y_max > max_y) max_y = e.y_max;
        int start_y = std::max(0, static_cast<int>(std::floor(m_edges.front().y_min)));
        int end_y = std::min(height - 1, static_cast<int>(std::ceil(max_y)));
        if (start_y > end_y) { m_edges.clear(); return; }

        const size_t arr = static_cast<size_t>(width) + 2;
        if (m_partial.size() != arr) { m_partial.assign(arr, 0.0f); m_delta.assign(arr, 0.0f); }
        float* partial = m_partial.data();
        float* delta = m_delta.data();

        constexpr float SUB_W = 1.0f / AA_SUB;
        const float fw = static_cast<float>(width);
        const bool opaque = (color >> 24) == 255;
        const size_t ne = m_edges.size();
        size_t next = 0;
        m_active.clear();

        int row_min = width, row_max = -1, touch_max = -1;
        auto span = [&](float l, float r) {
            if (l < 0.0f) l = 0.0f;
            if (r > fw) r = fw;
            if (r <= l) return;
            int ix0 = static_cast<int>(l);
            int ix1 = static_cast<int>(r);
            if (ix0 < row_min) row_min = ix0;
            if (ix1 > touch_max) touch_max = ix1;
            int last = ix1 < width ? ix1 : width - 1;
            if (last > row_max) row_max = last;
            if (ix0 == ix1) {
                partial[ix0] += (r - l) * SUB_W;
            } else {
                partial[ix0] += (static_cast<float>(ix0 + 1) - l) * SUB_W;
                delta[ix0 + 1] += SUB_W;
                delta[ix1] -= SUB_W;
                partial[ix1] += (r - static_cast<float>(ix1)) * SUB_W;
            }
        };

        for (int y = start_y; y <= end_y; ++y) {
            // Skip empty vertical gaps / finish early.
            if (m_active.empty()) {
                if (next >= ne) break;
                int ny = static_cast<int>(std::floor(m_edges[next].y_min));
                if (ny > y) { y = ny; if (y > end_y) break; }
            }

            row_min = width; row_max = -1; touch_max = -1;

            for (int s = 0; s < AA_SUB; ++s) {
                const float sy = y + (s + 0.5f) * SUB_W;

                // Activate edges that start at or above this sample line.
                while (next < ne && m_edges[next].y_min <= sy) {
                    const Edge& e = m_edges[next++];
                    if (e.y_max > sy)
                        m_active.push_back({e.y_max, e.x_at_ymin + (sy - e.y_min) * e.inv_slope,
                                            e.inv_slope * SUB_W, e.dir});
                }
                if (m_active.empty()) continue;

                // Drop finished edges (in place).
                size_t n = 0;
                for (size_t i = 0; i < m_active.size(); ++i)
                    if (m_active[i].y_max > sy) m_active[n++] = m_active[i];
                m_active.resize(n);
                if (n == 0) continue;

                // Insertion sort by x (list is nearly sorted between sub-scanlines).
                for (size_t i = 1; i < n; ++i) {
                    ActiveEdge key = m_active[i];
                    size_t j = i;
                    while (j > 0 && m_active[j - 1].x > key.x) { m_active[j] = m_active[j - 1]; --j; }
                    m_active[j] = key;
                }

                if (even_odd) {
                    for (size_t i = 0; i + 1 < n; i += 2) span(m_active[i].x, m_active[i + 1].x);
                } else {
                    int wind = 0;
                    float span_start = 0.0f;
                    for (size_t i = 0; i < n; ++i) {
                        int prev = wind;
                        wind += m_active[i].dir;
                        if (prev == 0 && wind != 0) span_start = m_active[i].x;
                        else if (prev != 0 && wind == 0) span(span_start, m_active[i].x);
                    }
                }

                // Advance every active edge to the next sub-scanline.
                for (size_t i = 0; i < n; ++i) m_active[i].x += m_active[i].dx;
            }

            if (row_max < row_min) continue;

            float run = 0.0f;
            uint32_t* row = buffer + static_cast<size_t>(y) * width;
            for (int x = row_min; x <= row_max; ++x) {
                run += delta[x];
                float cov = partial[x] + run;
                partial[x] = 0.0f;
                delta[x] = 0.0f;
                if (cov > 0.002f) {
                    if (cov >= 0.998f) row[x] = opaque ? color : blendColors(row[x], color, 1.0f);
                    else row[x] = blendColors(row[x], color, cov);
                }
            }
            for (int x = row_max + 1; x <= touch_max; ++x) { partial[x] = 0.0f; delta[x] = 0.0f; }
        }
        m_edges.clear();
        m_active.clear();
    }

    inline bool is_angle_in_range(float angle, float start, float end, bool counterclockwise) const {
        float two_pi = 6.28318530717958647692f;
        auto normalize = [two_pi](float a) {
            a = std::fmod(a, two_pi);
            if (a < 0) a += two_pi;
            if (a >= two_pi) a -= two_pi;
            return a;
        };
        angle = normalize(angle); float s = normalize(start); float e = normalize(end);
        if (counterclockwise) return (s >= e) ? (angle <= s && angle >= e) : (angle <= s || angle >= e);
        else return (s <= e) ? (angle >= s && angle <= e) : (angle >= s || angle <= e);
    }

    void fill_rect_internal(int x, int y, int w, int h, uint32_t color) {
        if (w <= 0 || h <= 0) return;
        int x_end = std::min(width, x + w), y_end = std::min(height, y + h);
        int start_x = std::max(0, x), start_y = std::max(0, y);
        if (start_x >= x_end || start_y >= y_end) return;
        if ((color >> 24) == 255) {
            uint32_t* row = buffer + static_cast<size_t>(start_y) * width + start_x;
            int rect_w = x_end - start_x;
            for (int cy = start_y; cy < y_end; ++cy) { std::fill(row, row + rect_w, color); row += width; }
        } else {
            for (int cy = start_y; cy < y_end; ++cy) {
                uint32_t* p = buffer + static_cast<size_t>(cy) * width + start_x;
                for (int cx = start_x; cx < x_end; ++cx, ++p) *p = blendColors(*p, color, 1.0f);
            }
        }
    }

    // Row-clipped; solid interior spans are filled directly, sqrt is only
    // evaluated on the 1px anti-aliased rim.
    void fill_circle_internal(int cx, int cy, int r, uint32_t color) {
        if (r <= 0) return;
        const float rf = static_cast<float>(r);
        const float r_outer = rf + 0.5f, r_outer_sq = r_outer * r_outer;
        const float r_inner = rf - 0.5f, r_inner_sq = (r_inner > 0) ? r_inner * r_inner : 0.0f;
        const bool opaque = (color >> 24) == 255;
        int y0 = std::max(-r - 1, -cy), y1 = std::min(r + 1, height - 1 - cy);
        for (int y = y0; y <= y1; ++y) {
            float y_sq = static_cast<float>(y * y);
            if (y_sq > r_outer_sq) continue;
            int max_x = static_cast<int>(std::ceil(std::sqrt(r_outer_sq - y_sq)));
            int xi = (y_sq <= r_inner_sq) ? static_cast<int>(std::sqrt(r_inner_sq - y_sq)) : -1;
            int xa = std::max(-max_x, -cx), xb = std::min(max_x, width - 1 - cx);
            if (xa > xb) continue;
            uint32_t* row = buffer + static_cast<size_t>(cy + y) * width + cx;

            auto rim = [&](int x) {
                float d2 = static_cast<float>(x * x) + y_sq;
                if (d2 >= r_outer_sq) return;
                float cov = 0.5f - (std::sqrt(d2) - rf);
                if (cov > 0.0f) row[x] = blendColors(row[x], color, cov);
            };

            if (xi < 0) {
                for (int x = xa; x <= xb; ++x) rim(x);
            } else {
                int le = std::min(-xi - 1, xb);
                for (int x = xa; x <= le; ++x) rim(x);
                int s0 = std::max(xa, -xi), s1 = std::min(xb, xi);
                if (s0 <= s1) {
                    if (opaque) std::fill(row + s0, row + s1 + 1, color);
                    else for (int x = s0; x <= s1; ++x) row[x] = blendColors(row[x], color, 1.0f);
                }
                for (int x = std::max(xa, xi + 1); x <= xb; ++x) rim(x);
            }
        }
    }

    // atan2() per pixel replaced with cross-product sector tests; sqrt only on the rim.
    void fill_arc_internal(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise, uint32_t color) {
        if (radius <= 0.0f) return;
        const float two_pi = 6.28318530717958647692f;
        float diff = endAngle - startAngle;
        bool is_full_circle = std::abs(std::abs(diff) - two_pi) < 0.0001f;
        float effective_diff = diff;
        if (is_full_circle) effective_diff = counterclockwise ? -two_pi : two_pi;
        else {
            if (counterclockwise) while (effective_diff > 0) effective_diff -= two_pi;
            else while (effective_diff < 0) effective_diff += two_pi;
        }
        if (effective_diff == 0.0f && !is_full_circle) return;

        const float sx = std::cos(startAngle), sy = std::sin(startAngle);
        const float ex = std::cos(endAngle), ey = std::sin(endAngle);
        const float dir = (effective_diff > 0.0f) ? 1.0f : -1.0f;
        const bool big = std::abs(effective_diff) > 3.14159265358979f;

        auto in_sector = [&](int px, int py) -> bool {
            if (px == 0 && py == 0) return true;
            float fx = static_cast<float>(px), fy = static_cast<float>(py);
            if (!big) {
                return dir * (sx * fy - sy * fx) >= 0.0f && dir * (fx * ey - fy * ex) >= 0.0f;
            }
            // Reflex sector = everything except the (strictly inside) complement e -> s.
            return !(dir * (ex * fy - ey * fx) > 0.0f && dir * (fx * sy - fy * sx) > 0.0f);
        };

        const int ccx = static_cast<int>(std::floor(cx)), ccy = static_cast<int>(std::floor(cy));
        const int r_int = static_cast<int>(std::ceil(radius));
        const float r_outer = radius + 0.5f, r_outer_sq = r_outer * r_outer;
        const float inner = radius - 0.5f;
        const float inner_sq = (inner > 0.0f) ? inner * inner : -1.0f;

        int y0 = std::max(-r_int, -ccy), y1 = std::min(r_int, height - 1 - ccy);
        for (int y = y0; y <= y1; ++y) {
            float y_sq = static_cast<float>(y * y);
            if (y_sq > r_outer_sq) continue;
            int max_x = static_cast<int>(std::ceil(std::sqrt(r_outer_sq - y_sq)));
            int xa = std::max(-max_x, -ccx), xb = std::min(max_x, width - 1 - ccx);
            uint32_t* row = buffer + static_cast<size_t>(ccy + y) * width + ccx;
            for (int x = xa; x <= xb; ++x) {
                float dist_sq = static_cast<float>(x * x) + y_sq;
                if (dist_sq > r_outer_sq) continue;
                if (!is_full_circle && !in_sector(x, y)) continue;
                float coverage;
                if (dist_sq < inner_sq) coverage = 1.0f;
                else {
                    float d = std::sqrt(dist_sq) - radius;
                    coverage = (d < -0.5f) ? 1.0f : (d > 0.5f) ? 0.0f : 0.5f - d;
                }
                if (coverage > 0.0f) row[x] = blendColors(row[x], color, coverage);
            }
        }
    }

    void fill_path_internal(const Path2D& path, uint32_t color, int curve_steps = 100) {
        auto subpaths = flatten_path(path, curve_steps);
        if (subpaths.empty()) return;
        m_edges.clear();
        float min_x = 1e9f, max_x = -1e9f, min_y = 1e9f, max_y = -1e9f;
        for (const auto& sp : subpaths) {
            size_t n = sp.size();
            if (n < 2) continue;
            for (size_t i = 0; i < n; ++i) {
                const auto& a = sp[i];
                const auto& b = sp[(i + 1) % n];
                if (a.first < min_x) min_x = a.first;
                if (a.first > max_x) max_x = a.first;
                if (a.second < min_y) min_y = a.second;
                if (a.second > max_y) max_y = a.second;
                add_edge(a.first, a.second, b.first, b.second, 1);
            }
        }
        int start_y = std::max(0, static_cast<int>(std::floor(min_y)));
        int end_y = std::min(height - 1, static_cast<int>(std::ceil(max_y)));
        if (m_edges.empty() || start_y > end_y || max_x < 0.0f || min_x > static_cast<float>(width)) {
            m_edges.clear();
            return;
        }
        raster_edges(color, true);
    }

    // ======================================================================
    // STROKE GEOMETRY (seamless)
    // Segment bodies, joins and caps are emitted as polygons into m_edges and
    // rasterised together with non-zero winding: a true union, no seams.
    // ======================================================================

    // xy = flat x,y pairs. orient: +1/-1 if the winding is known, 0 to detect.
    void stroke_add_poly(const float* xy, int n, int orient = 0) {
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
    }

    inline void stroke_add_tri(float ax, float ay, float bx, float by, float cx, float cy) {
        float p[6] = {ax, ay, bx, by, cx, cy};
        stroke_add_poly(p, 3);
    }

    inline void stroke_add_quad(float ax, float ay, float bx, float by, float cx, float cy, float dx, float dy) {
        float p[8] = {ax, ay, bx, by, cx, cy, dx, dy};
        stroke_add_poly(p, 4);
    }

    // Adaptive vertex count (0.1px max deviation), incremental rotation (no trig per vertex).
    void stroke_add_circle(float cx, float cy, float r) {
        if (r <= 0.0f) return;
        int n = 8;
        if (r > 0.1f) {
            float da = 2.0f * std::acos(1.0f - 0.1f / r);
            if (da > 1e-4f) n = static_cast<int>(std::ceil(6.2831853f / da));
            else n = 128;
        }
        if (n < 8) n = 8;
        if (n > 128) n = 128;
        float p[256];
        float step = 6.28318530717958647692f / n;
        float c = std::cos(step), s = std::sin(step);
        float x = r, y = 0.0f;
        for (int i = 0; i < n; ++i) {
            p[2 * i] = cx + x;
            p[2 * i + 1] = cy + y;
            float nx = x * c - y * s;
            y = x * s + y * c;
            x = nx;
        }
        stroke_add_poly(p, n, 1);
    }

    // One side (s = +1 left / -1 right) of a join: miter quad when allowed, else bevel triangle.
    void join_side(float px, float py, float u1x, float u1y, float u2x, float u2y,
                   float r, float s, bool miter) {
        float ax = px - u1y * r * s, ay = py + u1x * r * s;
        float bx = px - u2y * r * s, by = py + u2x * r * s;
        if (miter) {
            float denom = u1x * u2y - u1y * u2x;
            if (std::abs(denom) >= 1e-4f) {
                float t = ((bx - ax) * u2y - (by - ay) * u2x) / denom;
                if (t >= 0.0f) {
                    float mx = ax + t * u1x, my = ay + t * u1y;
                    float max_dist = m_miter_limit * r;
                    float d2 = (mx - px) * (mx - px) + (my - py) * (my - py);
                    if (d2 <= max_dist * max_dist) {
                        stroke_add_quad(px, py, ax, ay, mx, my, bx, by);
                        return;
                    }
                }
            }
        }
        stroke_add_tri(px, py, ax, ay, bx, by);
    }

    void draw_join(float px, float py, float u1x, float u1y, float u2x, float u2y, float r) {
        float cross = u1x * u2y - u1y * u2x;
        float dot = u1x * u2x + u1y * u2y;
        // Gentle turn (< ~45 deg), typical of flattened curves: only the outer
        // side has a gap, so a single wedge is enough.
        bool gentle = dot > 0.7f;
        float outer = (cross > 0.0f) ? -1.0f : 1.0f;

        if (m_line_join == JOIN_ROUND) {
            if (gentle) {
                float sag = r * (1.0f - std::sqrt((1.0f + dot) * 0.5f));
                if (sag <= 0.1f) { join_side(px, py, u1x, u1y, u2x, u2y, r, outer, false); return; }
            }
            stroke_add_circle(px, py, r);
            return;
        }

        bool miter = (m_line_join == JOIN_MITER);
        if (gentle) {
            join_side(px, py, u1x, u1y, u2x, u2y, r, outer, miter);
        } else {
            join_side(px, py, u1x, u1y, u2x, u2y, r, 1.0f, miter);
            join_side(px, py, u1x, u1y, u2x, u2y, r, -1.0f, miter);
        }
    }

    void draw_cap(float px, float py, float ux, float uy, float r, bool is_start) {
        if (m_line_cap == CAP_BUTT) return;
        if (m_line_cap == CAP_ROUND) {
            stroke_add_circle(px, py, r);
        } else { // CAP_SQUARE
            float nx = -uy, ny = ux;
            float Lx = px + nx * r, Ly = py + ny * r;
            float Rx = px - nx * r, Ry = py - ny * r;
            float ex = is_start ? -ux * r : ux * r;
            float ey = is_start ? -uy * r : uy * r;
            stroke_add_quad(Lx, Ly, Rx, Ry, Rx + ex, Ry + ey, Lx + ex, Ly + ey);
        }
    }

    void stroke_path_internal(const Path2D& path, uint32_t color, float stroke_w) {
        if (stroke_w <= 0.0f) return;
        auto subpaths = flatten_path(path, m_stroke_curve_steps);
        m_edges.clear();
        const float r = stroke_w * 0.5f;

        for (const auto& raw_pts : subpaths) {
            if (raw_pts.size() < 2) continue;

            auto& pts = m_pts;
            pts.clear();
            pts.push_back(raw_pts[0]);
            for (size_t i = 1; i < raw_pts.size(); ++i) {
                float dx = raw_pts[i].first - pts.back().first;
                float dy = raw_pts[i].second - pts.back().second;
                if (dx * dx + dy * dy > 1e-6f) pts.push_back(raw_pts[i]);
            }

            size_t N = pts.size();
            if (N < 2) continue;

            bool is_closed = false;
            float dx_c = pts.front().first - pts.back().first;
            float dy_c = pts.front().second - pts.back().second;
            if (dx_c * dx_c + dy_c * dy_c < 1e-6f) { is_closed = true; N--; }
            if (N < 2) continue;

            // Segment bodies; unit directions are computed once and reused by joins/caps.
            size_t seg_count = is_closed ? N : N - 1;
            m_dirs.resize(seg_count * 2);
            for (size_t i = 0; i < seg_count; ++i) {
                size_t j = (i + 1) % N;
                float x0 = pts[i].first, y0 = pts[i].second;
                float x1 = pts[j].first, y1 = pts[j].second;
                float dx = x1 - x0, dy = y1 - y0;
                float len2 = dx * dx + dy * dy;
                if (len2 < 1e-8f) { m_dirs[2 * i] = 0.0f; m_dirs[2 * i + 1] = 0.0f; continue; }
                float inv = 1.0f / std::sqrt(len2);
                float ux = dx * inv, uy = dy * inv;
                m_dirs[2 * i] = ux; m_dirs[2 * i + 1] = uy;
                float nx = -uy * r, ny = ux * r;
                float q[8] = {x0 + nx, y0 + ny, x1 + nx, y1 + ny,
                              x1 - nx, y1 - ny, x0 - nx, y0 - ny};
                stroke_add_poly(q, 4, -1); // this construction always has the same winding
            }

            // Joins and caps
            for (size_t i = 0; i < N; ++i) {
                bool interior = is_closed || (i > 0 && i < N - 1);
                if (interior) {
                    size_t in_seg = (i + N - 1) % N, out_seg = i;
                    float u1x = m_dirs[2 * in_seg], u1y = m_dirs[2 * in_seg + 1];
                    float u2x = m_dirs[2 * out_seg], u2y = m_dirs[2 * out_seg + 1];
                    if ((u1x == 0.0f && u1y == 0.0f) || (u2x == 0.0f && u2y == 0.0f)) continue;
                    draw_join(pts[i].first, pts[i].second, u1x, u1y, u2x, u2y, r);
                } else if (i == 0) {
                    float ux = m_dirs[0], uy = m_dirs[1];
                    if (ux == 0.0f && uy == 0.0f) continue;
                    draw_cap(pts[0].first, pts[0].second, ux, uy, r, true);
                } else { // i == N-1
                    float ux = m_dirs[2 * (N - 2)], uy = m_dirs[2 * (N - 2) + 1];
                    if (ux == 0.0f && uy == 0.0f) continue;
                    draw_cap(pts[N - 1].first, pts[N - 1].second, ux, uy, r, false);
                }
            }
        }

        // One pass for the entire stroke (all subpaths): true union, no seams.
        raster_edges(color, false);
    }

    inline void stroke_current(const Path2D& p) {
        stroke_path_internal(p, m_stroke_style, m_line_width);
    }

    Path2D text_path(const char* text, float x, float y) {
        Path2D out;
        if (!m_font || !text) return out;
        std::vector<Path2D> glyphs = m_font->get_string_paths(text);
        for (auto& g : glyphs) {
            for (auto& cmd : g.commands) {
                cmd.x1 += x; cmd.y1 = y - cmd.y1;
                cmd.x2 += x; cmd.y2 = y - cmd.y2;
                cmd.x3 += x; cmd.y3 = y - cmd.y3;
                out.commands.push_back(cmd);
            }
        }
        return out;
    }

public:
    Canvas2D(int w, int h) : width(w), height(h) {
        buffer = static_cast<uint32_t*>(std::malloc(static_cast<size_t>(width) * height * sizeof(uint32_t)));
        clear(rgba(0, 0, 0, 0));
    }
    ~Canvas2D() { std::free(buffer); }

    uint32_t* get_buffer() const { return buffer; }
    int get_width() const { return width; }
    int get_height() const { return height; }

    Canvas2D& fill_style(uint32_t color) { m_fill_style = color; return *this; }
    Canvas2D& stroke_style(uint32_t color) { m_stroke_style = color; return *this; }
    Canvas2D& line_width(float w) { m_line_width = w; return *this; }
    Canvas2D& font(Font* f) { m_font = f; return *this; }
    Font* font() const { return m_font; }

    Canvas2D& line_cap(LineCap cap) { m_line_cap = cap; return *this; }
    Canvas2D& line_join(LineJoin join) { m_line_join = join; return *this; }
    Canvas2D& miter_limit(float limit) { m_miter_limit = limit; return *this; }

    // Curve flattening steps used when stroking (default 200). Lower = faster,
    // e.g. 48-64 is plenty for small shapes.
    Canvas2D& stroke_curve_steps(int steps) { m_stroke_curve_steps = steps < 4 ? 4 : steps; return *this; }

    float measure_text(const char* text) {
        if (!m_font || !text) return 0.0f;
        return m_font->get_string_metrics(text).width;
    }

    Canvas2D& clear(uint32_t color) {
        std::fill(buffer, buffer + static_cast<size_t>(width) * height, color);
        return *this;
    }

    Canvas2D& path(const Path2D& path) {
        if ((m_fill_style >> 24) > 0) fill_path_internal(path, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) stroke_current(path);
        return *this;
    }

    Canvas2D& fill_text(const char* text, float x, float y) {
        if (!m_font || (m_fill_style >> 24) == 0) return *this;
        Path2D p = text_path(text, x, y);
        if (!p.commands.empty()) fill_path_internal(p, m_fill_style, 16);
        return *this;
    }

    Canvas2D& stroke_text(const char* text, float x, float y) {
        if (!m_font || (m_stroke_style >> 24) == 0 || m_line_width <= 0.0f) return *this;
        Path2D p = text_path(text, x, y);
        if (p.commands.empty()) return *this;
        stroke_current(p);
        return *this;
    }

    Canvas2D& draw_image(const Image& img, float x, float y) {
        return draw_image(img, x, y, static_cast<float>(img.getWidth()), static_cast<float>(img.getHeight()));
    }

    // Per-column source offsets are computed once per call instead of per pixel;
    // fully opaque / fully transparent source pixels skip the blend.
    Canvas2D& draw_image(const Image& img, float x, float y, float w, float h) {
        int iw = img.getWidth(), ih = img.getHeight(), channels = img.getChannels();
        const uint8_t* src = img.getData();
        if (!src || iw <= 0 || ih <= 0 || channels <= 0 || w <= 0.0f || h <= 0.0f) return *this;
        int start_x = std::max(0, static_cast<int>(std::floor(x)));
        int start_y = std::max(0, static_cast<int>(std::floor(y)));
        int end_x = std::min(width, static_cast<int>(std::ceil(x + w)));
        int end_y = std::min(height, static_cast<int>(std::ceil(y + h)));
        if (start_x >= end_x || start_y >= end_y) return *this;

        const int cols = end_x - start_x;
        m_xmap.resize(static_cast<size_t>(cols));
        for (int i = 0; i < cols; ++i) {
            float u = (start_x + i - x + 0.5f) / w;
            if (u < 0.0f) u = 0.0f; if (u > 1.0f) u = 1.0f;
            int src_x = static_cast<int>(u * iw);
            if (src_x >= iw) src_x = iw - 1;
            m_xmap[i] = src_x * channels;
        }
        const int* xmap = m_xmap.data();

        for (int cy = start_y; cy < end_y; ++cy) {
            float v = (cy - y + 0.5f) / h;
            if (v < 0.0f) v = 0.0f; if (v > 1.0f) v = 1.0f;
            int src_y = static_cast<int>(v * ih);
            if (src_y >= ih) src_y = ih - 1;
            const uint8_t* srow = src + static_cast<size_t>(src_y) * iw * channels;
            uint32_t* dst = buffer + static_cast<size_t>(cy) * width + start_x;

            if (channels == 4) {
                for (int i = 0; i < cols; ++i) {
                    const uint8_t* p = srow + xmap[i];
                    uint8_t a = p[3];
                    if (a == 255) dst[i] = rgba(p[0], p[1], p[2], 255);
                    else if (a != 0) dst[i] = blendColors(dst[i], rgba(p[0], p[1], p[2], a), 1.0f);
                }
            } else {
                for (int i = 0; i < cols; ++i) {
                    const uint8_t* p = srow + xmap[i];
                    uint8_t r = p[0], g = (channels > 1) ? p[1] : r, b = (channels > 2) ? p[2] : r;
                    dst[i] = rgba(r, g, b, 255);
                }
            }
        }
        return *this;
    }

    Canvas2D& rect(int x, int y, int w, int h) {
        if ((m_fill_style >> 24) > 0) fill_rect_internal(x, y, w, h, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) {
            Path2D p;
            p.mt(x, y).lt(x + w, y).lt(x + w, y + h).lt(x, y + h).close();
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& circle(int cx, int cy, int r) {
        if ((m_fill_style >> 24) > 0) fill_circle_internal(cx, cy, r, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) {
            Path2D p;
            p.mt(cx + r, cy).at(cx, cy, r, 0.0f, 6.2831853f, false).close();
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& arc(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise) {
        if ((m_fill_style >> 24) > 0) fill_arc_internal(cx, cy, radius, startAngle, endAngle, counterclockwise, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) {
            Path2D p;
            p.mt(cx + radius * std::cos(startAngle), cy + radius * std::sin(startAngle))
             .at(cx, cy, radius, startAngle, endAngle, counterclockwise);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& line(float x0, float y0, float x1, float y1) {
        if (m_line_width > 0.0f && (m_stroke_style >> 24) > 0) {
            Path2D p;
            p.mt(x0, y0).lt(x1, y1);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& quadratic_curve(float x0, float y0, float cx, float cy, float x1, float y1) {
        if (m_line_width > 0.0f && (m_stroke_style >> 24) > 0) {
            Path2D p;
            p.mt(x0, y0).qt(cx, cy, x1, y1);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& cubic_curve(float x0, float y0, float cx1, float cy1, float cx2, float cy2, float x1, float y1) {
        if (m_line_width > 0.0f && (m_stroke_style >> 24) > 0) {
            Path2D p;
            p.mt(x0, y0).ct(cx1, cy1, cx2, cy2, x1, y1);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& ellipse(int cx, int cy, int rx, int ry) {
        if (rx <= 0 || ry <= 0) return *this;
        if ((m_fill_style >> 24) == 0 && ((m_stroke_style >> 24) == 0 || m_line_width <= 0.0f)) return *this;
        float kappa = 0.5522848f;
        float ox = rx * kappa, oy = ry * kappa;
        Path2D p;
        p.mt(cx, cy - ry)
         .ct(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy)
         .ct(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry)
         .ct(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy)
         .ct(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry)
         .close();
        return path(p);
    }

    Canvas2D& polygon(const float* points, int num_points) {
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f && num_points >= 2) {
            Path2D p;
            p.mt(points[0], points[1]);
            for (int i = 1; i < num_points; ++i) {
                p.lt(points[i * 2], points[i * 2 + 1]);
            }
            p.close();
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& fill_solid(uint32_t color) {
        std::fill(buffer, buffer + static_cast<size_t>(width) * height, color);
        return *this;
    }
};

#endif // CANVAS2D_HPP
