// ./canvas2d.hpp  (speed-optimized; public API unchanged)
#ifndef CANVAS2D_HPP
#define CANVAS2D_HPP

#include <cstdint>
#include <cstdlib>
#include <cstring>
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

// ======================================================================
// GRADIENTS & PAINT SERVERS
// ======================================================================
struct GradientStop {
    float offset;
    uint32_t color;
};

class Gradient {
public:
    std::vector<GradientStop> stops;
    virtual ~Gradient() = default;

    Gradient& add_stop(float offset, uint32_t color) {
        stops.push_back({offset, color});
        std::sort(stops.begin(), stops.end(), [](const GradientStop& a, const GradientStop& b) {
            return a.offset < b.offset;
        });
        m_lut_valid = false;
        return *this;
    }

    // Call after editing `stops` directly.
    void invalidate() { m_lut_valid = false; }
    // Build the color LUT up front (do this before sharing across workers).
    void prepare() const { if (!m_lut_valid) build_lut(); }

    uint32_t evaluate(float t) const {
        if (stops.empty()) return 0;
        if (t <= stops.front().offset) return stops.front().color;
        if (t >= stops.back().offset) return stops.back().color;
        for (size_t i = 0; i + 1 < stops.size(); ++i) {
            if (t >= stops[i].offset && t <= stops[i+1].offset) {
                float local_t = (t - stops[i].offset) / (stops[i+1].offset - stops[i].offset);
                return lerp_color(stops[i].color, stops[i+1].color, local_t);
            }
        }
        return stops.back().color;
    }

    // Fast per-pixel lookup (precomputed ramp).
    inline uint32_t lookup(float t) const {
        if (!m_lut_valid) build_lut();
        float u = (t - m_t0) * m_scale;
        if (!(u > 0.0f)) u = 0.0f;               // also catches NaN
        if (u > static_cast<float>(LUT_SIZE - 1)) u = static_cast<float>(LUT_SIZE - 1);
        return m_lut[static_cast<int>(u + 0.5f)];
    }

    static uint32_t lerp_color(uint32_t c1, uint32_t c2, float t) {
        int r1 = c1 & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = (c1 >> 16) & 0xFF, a1 = (c1 >> 24) & 0xFF;
        int r2 = c2 & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = (c2 >> 16) & 0xFF, a2 = (c2 >> 24) & 0xFF;
        int r = (int)(r1 + (r2 - r1) * t);
        int g = (int)(g1 + (g2 - g1) * t);
        int b = (int)(b1 + (b2 - b1) * t);
        int a = (int)(a1 + (a2 - a1) * t);
        return (a << 24) | (b << 16) | (g << 8) | r;
    }

    virtual uint32_t get_color(float x, float y) const = 0;
    virtual bool is_opaque() const {
        for (const auto& s : stops) if ((s.color >> 24) != 255) return false;
        return true;
    }

private:
    static constexpr int LUT_SIZE = 1024;
    mutable std::vector<uint32_t> m_lut;
    mutable bool m_lut_valid = false;
    mutable float m_t0 = 0.0f, m_scale = 0.0f;

    void build_lut() const {
        m_lut.resize(LUT_SIZE);
        m_t0 = stops.empty() ? 0.0f : stops.front().offset;
        float t1 = stops.empty() ? 1.0f : stops.back().offset;
        float span = t1 - m_t0;
        bool ok = span > 1e-9f;
        m_scale = ok ? static_cast<float>(LUT_SIZE - 1) / span : 0.0f;
        for (int i = 0; i < LUT_SIZE; ++i) {
            float t = ok ? m_t0 + span * static_cast<float>(i) / static_cast<float>(LUT_SIZE - 1) : m_t0;
            m_lut[i] = evaluate(t);
        }
        m_lut_valid = true;
    }
};

class LinearGradient : public Gradient {
public:
    float x1, y1, x2, y2;
    LinearGradient(float x1, float y1, float x2, float y2) : x1(x1), y1(y1), x2(x2), y2(y2) {}

    uint32_t get_color(float x, float y) const override {
        float dx = x2 - x1;
        float dy = y2 - y1;
        float len2 = dx * dx + dy * dy;
        if (len2 < 1e-6f) return stops.empty() ? 0 : stops.front().color;
        float t = ((x - x1) * dx + (y - y1) * dy) / len2;
        return lookup(t);
    }
};

class RadialGradient : public Gradient {
public:
    float cx, cy, r;
    float fx, fy;
    RadialGradient(float cx, float cy, float r, float fx, float fy)
        : cx(cx), cy(cy), r(r), fx(fx), fy(fy) {}

    uint32_t get_color(float x, float y) const override {
        if (r < 1e-6f) return stops.empty() ? 0 : stops.front().color;
        float dx = x - fx;
        float dy = y - fy;
        float dist = std::sqrt(dx * dx + dy * dy);
        float t = dist / r;
        return lookup(t);
    }
};

class ConicalGradient : public Gradient {
public:
    float cx, cy;
    float startAngle;
    ConicalGradient(float cx, float cy, float startAngle = 0.0f)
        : cx(cx), cy(cy), startAngle(startAngle) {}

    uint32_t get_color(float x, float y) const override {
        float dx = x - cx;
        float dy = y - cy;
        float angle = std::atan2(dy, dx) - startAngle;
        if (angle < 0) angle += 6.283185307f;
        float t = angle / 6.283185307f;
        return lookup(t);
    }
};

struct Paint {
    enum Type { SOLID, GRADIENT };
    Type type;
    uint32_t color;
    Gradient* gradient;

    Paint(uint32_t c) : type(SOLID), color(c), gradient(nullptr) {}
    Paint(Gradient* g) : type(GRADIENT), color(0), gradient(g) {}

    inline uint32_t get_color(float x, float y) const {
        if (type == SOLID) return color;
        return gradient->get_color(x, y);
    }

    bool is_solid_opaque() const {
        return type == SOLID && (color >> 24) == 255;
    }

    bool is_opaque() const {
        if (type == SOLID) return (color >> 24) == 255;
        return gradient && gradient->is_opaque();
    }

    bool is_visible() const {
        if (type == SOLID) return (color >> 24) > 0;
        return gradient != nullptr && !gradient->stops.empty();
    }
};

class Canvas2D {
public:
    enum LineCap { CAP_BUTT = 0, CAP_ROUND = 1, CAP_SQUARE = 2 };
    enum LineJoin { JOIN_MITER = 0, JOIN_ROUND = 1, JOIN_BEVEL = 2 };

private:
    int width;
    int height;
    uint32_t* buffer;
    Paint m_fill_style = Paint(rgba(0, 0, 0, 255));
    Paint m_stroke_style = Paint(rgba(0, 0, 0, 255));
    float m_line_width = 1.0f;
    Font* m_font = nullptr;

    LineCap m_line_cap = CAP_BUTT;
    LineJoin m_line_join = JOIN_MITER;
    float m_miter_limit = 4.0f;
    int m_stroke_curve_steps = 200;

    bool m_shadow_enabled = false;
    float m_shadow_dx = 0.0f;
    float m_shadow_dy = 0.0f;
    float m_shadow_blur = 0.0f;
    uint32_t m_shadow_color = rgba(0, 0, 0, 128);

    // Raster target for offscreen buffer drawing
    uint32_t* m_tbuf;
    int m_tw, m_th;
    int m_tox, m_toy;

    // AA vertical sub-scanlines (horizontal coverage is analytic). 16 = best
    // quality; 8 is ~2x faster on the edge stage with a small quality cost.
    static constexpr int AA_SUB = 16;

    struct Edge { float y_min, y_max, x_at_ymin, inv_slope; int dir; };
    struct ActiveEdge { float y_max, x, dx; int dir; };
    struct Bounds { float min_x = 1e9f, max_x = -1e9f, min_y = 1e9f, max_y = -1e9f; };
    std::vector<Edge> m_edges;
    std::vector<ActiveEdge> m_active;
    std::vector<float> m_partial, m_delta;
    std::vector<std::pair<float, float>> m_pts;
    std::vector<float> m_dirs;
    std::vector<int> m_xmap;

    // Persistent scratch (avoids malloc/free per shadowed draw)
    std::vector<uint32_t> m_shadow_buf;
    std::vector<uint8_t> m_blur_a, m_blur_b;
    std::vector<uint32_t> m_blur_col, m_blur_recip;

    // Exact round(v/255) style blend of R+B lanes together, G separately.
    static inline uint32_t blend_over_opaque(uint32_t bg, uint32_t fg, uint32_t fa) {
        const uint32_t inv = 255u - fa;
        uint32_t rb = (fg & 0x00FF00FFu) * fa + (bg & 0x00FF00FFu) * inv + 0x00800080u;
        uint32_t g  = ((fg >> 8) & 0xFFu) * fa + ((bg >> 8) & 0xFFu) * inv + 0x80u;
        rb = ((rb + ((rb >> 8) & 0x00FF00FFu)) >> 8) & 0x00FF00FFu;
        g  = ((g + (g >> 8)) >> 8) & 0xFFu;
        return 0xFF000000u | rb | (g << 8);
    }

    inline uint32_t blendColors(uint32_t bg, uint32_t fg, float coverage) {
        if (coverage <= 0.0f) return bg;
        if (coverage > 1.0f) coverage = 1.0f;
        uint32_t a_fg = fg >> 24, a_bg = bg >> 24;
        uint32_t fa = (uint32_t)(a_fg * coverage + 0.5f);
        if (fa == 0) return bg;
        if (fa == 255 && a_fg == 255) return fg;
        if (a_bg == 255) return blend_over_opaque(bg, fg, fa);
        if (a_bg == 0) return (fa << 24) | (fg & 0x00FFFFFFu);   // transparent canvas: no math needed
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

    void set_target(uint32_t* buf, int w, int h, int ox, int oy) {
        m_tbuf = buf; m_tw = w; m_th = h; m_tox = ox; m_toy = oy;
    }

    void reset_target() {
        m_tbuf = buffer; m_tw = width; m_th = height; m_tox = 0; m_toy = 0;
    }

    inline void add_edge(float x1, float y1, float x2, float y2, int dir) {
        if (y1 == y2) return;
        if (y1 > y2) { std::swap(x1, x2); std::swap(y1, y2); dir = -dir; }
        // Cull edges that can never touch a scanline of the current target.
        if (y2 <= static_cast<float>(m_toy) || y1 >= static_cast<float>(m_toy + m_th)) return;
        m_edges.push_back({y1, y2, x1, (x2 - x1) / (y2 - y1), dir});
    }

    void raster_edges(const Paint& paint, bool even_odd) {
        if (m_edges.empty()) return;

        std::sort(m_edges.begin(), m_edges.end(),
                  [](const Edge& a, const Edge& b) { return a.y_min < b.y_min; });

        float max_y = -1e9f;
        for (const auto& e : m_edges) if (e.y_max > max_y) max_y = e.y_max;

        int start_y = std::max(m_toy, static_cast<int>(std::floor(m_edges.front().y_min)));
        int end_y = std::min(m_toy + m_th - 1, static_cast<int>(std::ceil(max_y)));
        if (start_y > end_y) { m_edges.clear(); return; }

        // Grow-only: rows are always left zeroed, so a larger array is safe.
        const size_t arr = static_cast<size_t>(m_tw) + 2;
        if (m_partial.size() < arr) { m_partial.assign(arr, 0.0f); m_delta.assign(arr, 0.0f); }
        float* partial = m_partial.data();
        float* delta = m_delta.data();

        constexpr float SUB_W = 1.0f / AA_SUB;
        const float fw = static_cast<float>(m_tw);
        const bool solid_opaque = paint.is_solid_opaque();
        const bool solid = paint.type == Paint::SOLID;
        const uint32_t solid_c = paint.color;
        const size_t ne = m_edges.size();
        size_t next = 0;
        m_active.clear();

        int row_min = m_tw, row_max = -1, touch_max = -1;
        auto span = [&](float l, float r) {
            l -= m_tox;
            r -= m_tox;
            if (l < 0.0f) l = 0.0f;
            if (r > fw) r = fw;
            if (r <= l) return;
            int ix0 = static_cast<int>(l);
            int ix1 = static_cast<int>(r);
            if (ix0 < row_min) row_min = ix0;
            if (ix1 > touch_max) touch_max = ix1;
            int last = ix1 < m_tw ? ix1 : m_tw - 1;
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

        for (int gy = start_y; gy <= end_y; ++gy) {
            if (m_active.empty()) {
                if (next >= ne) break;
                int ny = static_cast<int>(std::floor(m_edges[next].y_min));
                if (ny > gy) { gy = ny; if (gy > end_y) break; }
            }

            row_min = m_tw; row_max = -1; touch_max = -1;

            for (int s = 0; s < AA_SUB; ++s) {
                const float sy = gy + (s + 0.5f) * SUB_W;

                while (next < ne && m_edges[next].y_min <= sy) {
                    const Edge& e = m_edges[next++];
                    if (e.y_max > sy)
                        m_active.push_back({e.y_max, e.x_at_ymin + (sy - e.y_min) * e.inv_slope,
                                            e.inv_slope * SUB_W, e.dir});
                }
                if (m_active.empty()) continue;

                size_t n = 0;
                for (size_t i = 0; i < m_active.size(); ++i)
                    if (m_active[i].y_max > sy) m_active[n++] = m_active[i];
                m_active.resize(n);
                if (n == 0) continue;

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

                for (size_t i = 0; i < n; ++i) m_active[i].x += m_active[i].dx;
            }

            if (row_max < row_min) continue;

            float run = 0.0f;
            int y = gy - m_toy;
            uint32_t* row = m_tbuf + static_cast<size_t>(y) * m_tw;
            const float fy = gy + 0.5f;
            for (int x = row_min; x <= row_max; ++x) {
                run += delta[x];
                float cov = partial[x] + run;
                partial[x] = 0.0f;
                delta[x] = 0.0f;
                if (cov > 0.002f) {
                    uint32_t c = solid ? solid_c : paint.get_color(x + m_tox + 0.5f, fy);
                    if (cov >= 0.998f) row[x] = solid_opaque ? c : blendColors(row[x], c, 1.0f);
                    else row[x] = blendColors(row[x], c, cov);
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

    void fill_rect_internal(int x, int y, int w, int h, const Paint& paint) {
        if (w <= 0 || h <= 0) return;
        int x_end = std::min(width, x + w), y_end = std::min(height, y + h);
        int start_x = std::max(0, x), start_y = std::max(0, y);
        if (start_x >= x_end || start_y >= y_end) return;

        if (paint.is_solid_opaque()) {
            uint32_t* row = buffer + static_cast<size_t>(start_y) * width + start_x;
            int rect_w = x_end - start_x;
            for (int cy = start_y; cy < y_end; ++cy) {
                std::fill(row, row + rect_w, paint.color);
                row += width;
            }
        } else if (paint.type == Paint::SOLID) {
            const uint32_t c = paint.color;
            for (int cy = start_y; cy < y_end; ++cy) {
                uint32_t* p = buffer + static_cast<size_t>(cy) * width + start_x;
                for (int cx = start_x; cx < x_end; ++cx, ++p) *p = blendColors(*p, c, 1.0f);
            }
        } else {
            for (int cy = start_y; cy < y_end; ++cy) {
                uint32_t* p = buffer + static_cast<size_t>(cy) * width + start_x;
                for (int cx = start_x; cx < x_end; ++cx, ++p) {
                    uint32_t c = paint.get_color(cx + 0.5f, cy + 0.5f);
                    *p = blendColors(*p, c, 1.0f);
                }
            }
        }
    }

    void fill_circle_internal(int cx, int cy, int r, const Paint& paint) {
        if (r <= 0) return;
        const float rf = static_cast<float>(r);
        const float r_outer = rf + 0.5f, r_outer_sq = r_outer * r_outer;
        const float r_inner = rf - 0.5f, r_inner_sq = (r_inner > 0) ? r_inner * r_inner : 0.0f;
        const bool solid_opaque = paint.is_solid_opaque();
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
                if (cov > 0.0f) {
                    uint32_t c = paint.get_color(cx + x + 0.5f, cy + y + 0.5f);
                    row[x] = blendColors(row[x], c, cov);
                }
            };

            if (xi < 0) {
                for (int x = xa; x <= xb; ++x) rim(x);
            } else {
                int le = std::min(-xi - 1, xb);
                for (int x = xa; x <= le; ++x) rim(x);
                int s0 = std::max(xa, -xi), s1 = std::min(xb, xi);
                if (s0 <= s1) {
                    if (solid_opaque) std::fill(row + s0, row + s1 + 1, paint.color);
                    else for (int x = s0; x <= s1; ++x) {
                        uint32_t c = paint.get_color(cx + x + 0.5f, cy + y + 0.5f);
                        row[x] = blendColors(row[x], c, 1.0f);
                    }
                }
                for (int x = std::max(xa, xi + 1); x <= xb; ++x) rim(x);
            }
        }
    }

    void fill_arc_internal(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise, const Paint& paint) {
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
        const bool solid_opaque = paint.is_solid_opaque();

        auto in_sector = [&](int px, int py) -> bool {
            if (px == 0 && py == 0) return true;
            float fx = static_cast<float>(px), fy = static_cast<float>(py);
            if (!big) {
                return dir * (sx * fy - sy * fx) >= 0.0f && dir * (fx * ey - fy * ex) >= 0.0f;
            }
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
                if (dist_sq < inner_sq) {
                    if (solid_opaque) { row[x] = paint.color; continue; }
                    coverage = 1.0f;
                } else {
                    float d = std::sqrt(dist_sq) - radius;
                    coverage = (d < -0.5f) ? 1.0f : (d > 0.5f) ? 0.0f : 0.5f - d;
                }
                if (coverage > 0.0f) {
                    uint32_t c = paint.get_color(ccx + x + 0.5f, ccy + y + 0.5f);
                    row[x] = blendColors(row[x], c, coverage);
                }
            }
        }
    }

    // Appends closed-polygon edges for every subpath; returns their bounds.
    template <class SP>
    Bounds add_fill_edges(const SP& subpaths) {
        Bounds b;
        for (const auto& sp : subpaths) {
            size_t n = sp.size();
            if (n < 2) continue;
            for (size_t i = 0; i < n; ++i) {
                const auto& a = sp[i];
                const auto& c = sp[(i + 1) % n];
                if (a.first < b.min_x) b.min_x = a.first;
                if (a.first > b.max_x) b.max_x = a.first;
                if (a.second < b.min_y) b.min_y = a.second;
                if (a.second > b.max_y) b.max_y = a.second;
                add_edge(a.first, a.second, c.first, c.second, 1);
            }
        }
        return b;
    }

    // Fill already-flattened subpaths (canvas target only).
    template <class SP>
    void fill_subpaths(const SP& subpaths, const Paint& paint) {
        m_edges.clear();
        Bounds b = add_fill_edges(subpaths);
        int start_y = std::max(0, static_cast<int>(std::floor(b.min_y)));
        int end_y = std::min(height - 1, static_cast<int>(std::ceil(b.max_y)));
        if (m_edges.empty() || start_y > end_y || b.max_x < 0.0f || b.min_x > static_cast<float>(width)) {
            m_edges.clear();
            return;
        }
        raster_edges(paint, true);
    }

    void fill_path_internal(const Path2D& path, const Paint& paint, int curve_steps = 100) {
        auto subpaths = flatten_path(path, curve_steps);
        if (subpaths.empty()) return;
        fill_subpaths(subpaths, paint);
    }

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

        // Nearly collinear: the outer gap is far below a pixel, skip the join.
        // (Huge win for finely flattened curves: one join per vertex.)
        if (dot > 0.0f && r * std::abs(cross) < 0.03f) return;

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
        } else {
            float nx = -uy, ny = ux;
            float Lx = px + nx * r, Ly = py + ny * r;
            float Rx = px - nx * r, Ry = py - ny * r;
            float ex = is_start ? -ux * r : ux * r;
            float ey = is_start ? -uy * r : uy * r;
            stroke_add_quad(Lx, Ly, Rx, Ry, Rx + ex, Ry + ey, Lx + ex, Ly + ey);
        }
    }

    void stroke_path_internal(const Path2D& path, const Paint& paint, float stroke_w) {
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
                stroke_add_poly(q, 4, -1);
            }

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
                } else {
                    float ux = m_dirs[2 * (N - 2)], uy = m_dirs[2 * (N - 2) + 1];
                    if (ux == 0.0f && uy == 0.0f) continue;
                    draw_cap(pts[N - 1].first, pts[N - 1].second, ux, uy, r, false);
                }
            }
        }
        raster_edges(paint, false);
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

    // ======================================================================
    // DROP SHADOW IMPLEMENTATION
    // ======================================================================
    // Same result as the original 2-passes-per-axis box blur, but:
    //  - persistent scratch buffers (no per-call allocation)
    //  - reciprocal multiply instead of integer division
    //  - vertical pass is row-wise (cache friendly / auto-vectorizable)
    void box_blur(uint32_t* buf, int w, int h, int radius) {
        if (radius <= 0) return;
        const int n = w * h;
        const int r = std::max(1, (int)(radius * 1.5f));

        m_blur_a.resize(n);
        m_blur_b.resize(n);
        uint8_t* a1 = m_blur_a.data();
        uint8_t* a2 = m_blur_b.data();
        for (int i = 0; i < n; ++i) a1[i] = (uint8_t)(buf[i] >> 24);

        m_blur_recip.resize(static_cast<size_t>(2 * r + 2));
        for (int c = 1; c < 2 * r + 2; ++c) m_blur_recip[c] = (65536u + c - 1) / c;
        const uint32_t* recip = m_blur_recip.data();

        auto hpass = [&](const uint8_t* src, uint8_t* dst) {
            for (int y = 0; y < h; ++y) {
                const uint8_t* s = src + static_cast<size_t>(y) * w;
                uint8_t* d = dst + static_cast<size_t>(y) * w;
                uint32_t sum = 0;
                int init = std::min(r, w - 1);
                for (int k = 0; k <= init; ++k) sum += s[k];
                for (int x = 0; x < w; ++x) {
                    int lo = x - r < 0 ? 0 : x - r;
                    int hi = x + r > w - 1 ? w - 1 : x + r;
                    d[x] = (uint8_t)((sum * recip[hi - lo + 1]) >> 16);
                    if (x + r + 1 < w) sum += s[x + r + 1];
                    if (x - r >= 0) sum -= s[x - r];
                }
            }
        };

        auto vpass = [&](const uint8_t* src, uint8_t* dst) {
            m_blur_col.assign(static_cast<size_t>(w), 0u);
            uint32_t* col = m_blur_col.data();
            int init = std::min(r, h - 1);
            for (int k = 0; k <= init; ++k) {
                const uint8_t* s = src + static_cast<size_t>(k) * w;
                for (int x = 0; x < w; ++x) col[x] += s[x];
            }
            for (int y = 0; y < h; ++y) {
                int lo = y - r < 0 ? 0 : y - r;
                int hi = y + r > h - 1 ? h - 1 : y + r;
                const uint32_t inv = recip[hi - lo + 1];
                uint8_t* d = dst + static_cast<size_t>(y) * w;
                for (int x = 0; x < w; ++x) d[x] = (uint8_t)((col[x] * inv) >> 16);
                if (y + r + 1 < h) {
                    const uint8_t* s = src + static_cast<size_t>(y + r + 1) * w;
                    for (int x = 0; x < w; ++x) col[x] += s[x];
                }
                if (y - r >= 0) {
                    const uint8_t* s = src + static_cast<size_t>(y - r) * w;
                    for (int x = 0; x < w; ++x) col[x] -= s[x];
                }
            }
        };

        hpass(a1, a2);
        vpass(a2, a1);
        hpass(a1, a2);
        vpass(a2, a1);

        const uint32_t rgb = m_shadow_color & 0x00FFFFFFu;
        for (int i = 0; i < n; ++i) buf[i] = (static_cast<uint32_t>(a1[i]) << 24) | rgb;
    }

    void composite_buffer(uint32_t* src, int sw, int sh, int off_x, int off_y) {
        int start_x = std::max(0, off_x);
        int start_y = std::max(0, off_y);
        int end_x = std::min(width, off_x + sw);
        int end_y = std::min(height, off_y + sh);

        for (int y = start_y; y < end_y; ++y) {
            int sy = y - off_y;
            const uint32_t* src_row = src + static_cast<size_t>(sy) * sw;
            uint32_t* dst_row = buffer + static_cast<size_t>(y) * width;
            for (int x = start_x; x < end_x; ++x) {
                uint32_t fg = src_row[x - off_x];
                if ((fg >> 24) > 0) dst_row[x] = blendColors(dst_row[x], fg, 1.0f);
            }
        }
    }

    void draw_with_shadow(const Path2D& p, bool do_fill, bool do_stroke) {
        // Flatten once; reused for the shadow pass and the real fill.
        auto subpaths = flatten_path(p, 16);
        if (subpaths.empty()) return;
        float min_x = 1e9f, max_x = -1e9f, min_y = 1e9f, max_y = -1e9f;
        for (const auto& sp : subpaths) {
            for (const auto& pt : sp) {
                if (pt.first < min_x) min_x = pt.first;
                if (pt.first > max_x) max_x = pt.first;
                if (pt.second < min_y) min_y = pt.second;
                if (pt.second > max_y) max_y = pt.second;
            }
        }

        if (min_x >= max_x || min_y >= max_y) return;

        float expand = do_stroke ? m_line_width * 0.5f : 0.0f;
        min_x -= expand; max_x += expand;
        min_y -= expand; max_y += expand;

        int margin = (int)std::ceil(m_shadow_blur * 6.0f) + 2;
        int bb_x = std::max(0, (int)std::floor(min_x) - margin);
        int bb_y = std::max(0, (int)std::floor(min_y) - margin);
        int bb_w = std::min(width - bb_x, (int)std::ceil(max_x) - (int)std::floor(min_x) + 2 * margin);
        int bb_h = std::min(height - bb_y, (int)std::ceil(max_y) - (int)std::floor(min_y) + 2 * margin);

        if (bb_w <= 0 || bb_h <= 0) return;

        m_shadow_buf.assign(static_cast<size_t>(bb_w) * bb_h, 0u);
        uint32_t* temp = m_shadow_buf.data();

        set_target(temp, bb_w, bb_h, bb_x, bb_y);

        Paint shadow_paint(m_shadow_color);

        if (do_fill) {
            m_edges.clear();
            add_fill_edges(subpaths);
            if (!m_edges.empty()) raster_edges(shadow_paint, true);
        }

        if (do_stroke) {
            stroke_path_internal(p, shadow_paint, m_line_width);
        }

        reset_target();

        int blur_radius = (int)std::ceil(m_shadow_blur);
        if (blur_radius > 0) {
            box_blur(temp, bb_w, bb_h, blur_radius);
        }

        composite_buffer(temp, bb_w, bb_h, bb_x + (int)std::round(m_shadow_dx), bb_y + (int)std::round(m_shadow_dy));

        if (do_fill) fill_subpaths(subpaths, m_fill_style);
        if (do_stroke) stroke_path_internal(p, m_stroke_style, m_line_width);
    }

public:
    Canvas2D(int w, int h) : width(w), height(h) {
        buffer = static_cast<uint32_t*>(std::malloc(static_cast<size_t>(width) * height * sizeof(uint32_t)));
        m_tbuf = buffer; m_tw = width; m_th = height; m_tox = 0; m_toy = 0;
        clear(rgba(0, 0, 0, 0));
    }
    ~Canvas2D() { std::free(buffer); }

    uint32_t* get_buffer() const { return buffer; }
    int get_width() const { return width; }
    int get_height() const { return height; }

    Canvas2D& fill_style(uint32_t color) { m_fill_style = Paint(color); return *this; }
    Canvas2D& fill_style(Gradient* grad) { if (grad) grad->prepare(); m_fill_style = Paint(grad); return *this; }
    Canvas2D& stroke_style(uint32_t color) { m_stroke_style = Paint(color); return *this; }
    Canvas2D& stroke_style(Gradient* grad) { if (grad) grad->prepare(); m_stroke_style = Paint(grad); return *this; }
    Canvas2D& line_width(float w) { m_line_width = w; return *this; }
    Canvas2D& font(Font* f) { m_font = f; return *this; }
    Font* font() const { return m_font; }

    Canvas2D& line_cap(LineCap cap) { m_line_cap = cap; return *this; }
    Canvas2D& line_join(LineJoin join) { m_line_join = join; return *this; }
    Canvas2D& miter_limit(float limit) { m_miter_limit = limit; return *this; }

    Canvas2D& drop_shadow(float dx, float dy, float blur, uint32_t color) {
        m_shadow_enabled = true;
        m_shadow_dx = dx;
        m_shadow_dy = dy;
        m_shadow_blur = blur;
        m_shadow_color = color;
        return *this;
    }

    Canvas2D& clear_shadow() {
        m_shadow_enabled = false;
        return *this;
    }

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
        if (m_shadow_enabled) {
            draw_with_shadow(path, m_fill_style.is_visible(), m_stroke_style.is_visible() && m_line_width > 0.0f);
        } else {
            if (m_fill_style.is_visible()) fill_path_internal(path, m_fill_style);
            if (m_stroke_style.is_visible() && m_line_width > 0.0f) stroke_current(path);
        }
        return *this;
    }

    Canvas2D& fill_text(const char* text, float x, float y) {
        if (!m_font || !m_fill_style.is_visible()) return *this;
        Path2D p = text_path(text, x, y);
        if (p.commands.empty()) return *this;

        if (m_shadow_enabled) {
            draw_with_shadow(p, true, false);
        } else {
            fill_path_internal(p, m_fill_style, 16);
        }
        return *this;
    }

    Canvas2D& stroke_text(const char* text, float x, float y) {
        if (!m_font || !m_stroke_style.is_visible() || m_line_width <= 0.0f) return *this;
        Path2D p = text_path(text, x, y);
        if (p.commands.empty()) return *this;

        if (m_shadow_enabled) {
            draw_with_shadow(p, false, true);
        } else {
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& draw_image(const Image& img, float x, float y) {
        return draw_image(img, x, y, static_cast<float>(img.getWidth()), static_cast<float>(img.getHeight()));
    }

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
                // RGBA bytes == our packed layout on little-endian: one 32-bit load per pixel.
                for (int i = 0; i < cols; ++i) {
                    uint32_t px;
                    std::memcpy(&px, srow + xmap[i], 4);
                    uint32_t a = px >> 24;
                    if (a == 255) dst[i] = px;
                    else if (a != 0) dst[i] = blendColors(dst[i], px, 1.0f);
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
        if (m_fill_style.is_visible()) fill_rect_internal(x, y, w, h, m_fill_style);
        if (m_stroke_style.is_visible() && m_line_width > 0.0f) {
            Path2D p;
            p.mt(x, y).lt(x + w, y).lt(x + w, y + h).lt(x, y + h).close();
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& circle(int cx, int cy, int r) {
        if (m_fill_style.is_visible()) fill_circle_internal(cx, cy, r, m_fill_style);
        if (m_stroke_style.is_visible() && m_line_width > 0.0f) {
            Path2D p;
            p.mt(cx + r, cy).at(cx, cy, r, 0.0f, 6.2831853f, false).close();
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& arc(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise) {
        if (m_fill_style.is_visible()) fill_arc_internal(cx, cy, radius, startAngle, endAngle, counterclockwise, m_fill_style);
        if (m_stroke_style.is_visible() && m_line_width > 0.0f) {
            Path2D p;
            p.mt(cx + radius * std::cos(startAngle), cy + radius * std::sin(startAngle))
             .at(cx, cy, radius, startAngle, endAngle, counterclockwise);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& line(float x0, float y0, float x1, float y1) {
        if (m_line_width > 0.0f && m_stroke_style.is_visible()) {
            Path2D p;
            p.mt(x0, y0).lt(x1, y1);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& quadratic_curve(float x0, float y0, float cx, float cy, float x1, float y1) {
        if (m_line_width > 0.0f && m_stroke_style.is_visible()) {
            Path2D p;
            p.mt(x0, y0).qt(cx, cy, x1, y1);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& cubic_curve(float x0, float y0, float cx1, float cy1, float cx2, float cy2, float x1, float y1) {
        if (m_line_width > 0.0f && m_stroke_style.is_visible()) {
            Path2D p;
            p.mt(x0, y0).ct(cx1, cy1, cx2, cy2, x1, y1);
            stroke_current(p);
        }
        return *this;
    }

    Canvas2D& ellipse(int cx, int cy, int rx, int ry) {
        if (rx <= 0 || ry <= 0) return *this;
        if (!m_fill_style.is_visible() && (!m_stroke_style.is_visible() || m_line_width <= 0.0f)) return *this;
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
        if (m_stroke_style.is_visible() && m_line_width > 0.0f && num_points >= 2) {
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
