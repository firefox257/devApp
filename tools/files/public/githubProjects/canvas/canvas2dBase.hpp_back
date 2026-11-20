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
constexpr uint32_t rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255) {
    return (static_cast<uint32_t>(a) << 24) | 
           (static_cast<uint32_t>(b) << 16) | 
           (static_cast<uint32_t>(g) << 8)  | 
           static_cast<uint32_t>(r);
}

class Canvas2D {
private:
    int width;
    int height;
    uint32_t* buffer;

    uint32_t m_fill_style = rgba(0, 0, 0, 255);
    uint32_t m_stroke_style = rgba(0, 0, 0, 255);
    float m_line_width = 1.0f;

    // ---- Stroke coverage mask (union of all segments of one stroke op) ----
    std::vector<float> m_mask;
    bool m_mask_on = false;
    uint32_t m_mask_color = 0;
    int m_mask_min_x = 0, m_mask_max_x = -1, m_mask_min_y = 0, m_mask_max_y = -1;

    inline uint8_t getR(uint32_t c) const { return c & 0xFF; }
    inline uint8_t getG(uint32_t c) const { return (c >> 8) & 0xFF; }
    inline uint8_t getB(uint32_t c) const { return (c >> 16) & 0xFF; }
    inline uint8_t getA(uint32_t c) const { return (c >> 24) & 0xFF; }

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
        if (r > 255) r = 255;
        if (g > 255) g = 255;
        if (b > 255) b = 255;

        return (outA << 24) | (b << 16) | (g << 8) | r;
    }

    inline void set_pixel(int x, int y, uint32_t color) {
        if ((unsigned)x < (unsigned)width && (unsigned)y < (unsigned)height) buffer[y * width + x] = color;
    }

    inline void put_pixel_aa(int x, int y, uint32_t color, float coverage) {
        if ((unsigned)x < (unsigned)width && (unsigned)y < (unsigned)height) {
            buffer[y * width + x] = blendColors(buffer[y * width + x], color, coverage);
        }
    }

    // ---- Stroke mask helpers ----
    void begin_stroke(uint32_t color) {
        if (m_mask.size() != static_cast<size_t>(width) * static_cast<size_t>(height)) {
            m_mask.assign(static_cast<size_t>(width) * static_cast<size_t>(height), 0.0f);
        }
        m_mask_on = true;
        m_mask_color = color;
        m_mask_min_x = width; m_mask_max_x = -1;
        m_mask_min_y = height; m_mask_max_y = -1;
    }

    void end_stroke() {
        if (!m_mask_on) return;
        m_mask_on = false;
        if (m_mask_max_x < m_mask_min_x || m_mask_max_y < m_mask_min_y) return;
        for (int y = m_mask_min_y; y <= m_mask_max_y; ++y) {
            size_t row = static_cast<size_t>(y) * width;
            for (int x = m_mask_min_x; x <= m_mask_max_x; ++x) {
                float& m = m_mask[row + x];
                if (m > 0.0f) {
                    buffer[row + x] = blendColors(buffer[row + x], m_mask_color, m);
                    m = 0.0f;
                }
            }
        }
    }

    // Stroke pixel: in mask mode keeps max coverage, otherwise blends directly.
    inline void stroke_pixel(int x, int y, uint32_t color, float cov) {
        if (cov <= 0.0f) return;
        if ((unsigned)x >= (unsigned)width || (unsigned)y >= (unsigned)height) return;
        if (cov > 1.0f) cov = 1.0f;
        if (m_mask_on) {
            float& m = m_mask[static_cast<size_t>(y) * width + x];
            if (cov > m) m = cov;
            if (x < m_mask_min_x) m_mask_min_x = x;
            if (x > m_mask_max_x) m_mask_max_x = x;
            if (y < m_mask_min_y) m_mask_min_y = y;
            if (y > m_mask_max_y) m_mask_max_y = y;
        } else {
            buffer[y * width + x] = blendColors(buffer[y * width + x], color, cov);
        }
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

    void line_internal(float x0, float y0, float x1, float y1, uint32_t color, float width) {
        if (width <= 1.0f) {
            // Xiaolin Wu line; coverage scaled by width for sub-pixel widths
            const float ws = (width < 1.0f) ? width : 1.0f;
            bool steep = std::abs(y1 - y0) > std::abs(x1 - x0);
            if (steep) { std::swap(x0, y0); std::swap(x1, y1); }
            if (x0 > x1) { std::swap(x0, x1); std::swap(y0, y1); }

            // plot(major, minor): maps back to real x,y depending on steepness
            auto plot = [&](int major, int minor, float c) {
                if (steep) stroke_pixel(minor, major, color, c * ws);
                else       stroke_pixel(major, minor, color, c * ws);
            };

            float dx = x1 - x0, dy = y1 - y0;
            float gradient = (dx == 0.0f) ? 1.0f : dy / dx;

            float xend = std::floor(x0 + 0.5f);
            float yend = y0 + gradient * (xend - x0);
            float xgap = 1.0f - (x0 + 0.5f - std::floor(x0 + 0.5f));
            int xpxl1 = static_cast<int>(xend), ypxl1 = static_cast<int>(std::floor(yend));
            plot(xpxl1, ypxl1,     (1.0f - (yend - std::floor(yend))) * xgap);
            plot(xpxl1, ypxl1 + 1, (yend - std::floor(yend)) * xgap);
            float intery = yend + gradient;

            xend = std::floor(x1 + 0.5f);
            yend = y1 + gradient * (xend - x1);
            xgap = x1 + 0.5f - std::floor(x1 + 0.5f);
            int xpxl2 = static_cast<int>(xend), ypxl2 = static_cast<int>(std::floor(yend));
            plot(xpxl2, ypxl2,     (1.0f - (yend - std::floor(yend))) * xgap);
            plot(xpxl2, ypxl2 + 1, (yend - std::floor(yend)) * xgap);

            for (int x = xpxl1 + 1; x < xpxl2; ++x) {
                int iy = static_cast<int>(std::floor(intery)); float f = intery - iy;
                plot(x, iy,     1.0f - f);
                plot(x, iy + 1, f);
                intery += gradient;
            }
        } else {
            float r = width / 2.0f;
            float min_x = std::max(0.0f, std::min(x0, x1) - r - 2.0f);
            float max_x = std::min(static_cast<float>(this->width - 1), std::max(x0, x1) + r + 2.0f);
            float min_y = std::max(0.0f, std::min(y0, y1) - r - 2.0f);
            float max_y = std::min(static_cast<float>(this->height - 1), std::max(y0, y1) + r + 2.0f);
            float l2 = (x1 - x0)*(x1 - x0) + (y1 - y0)*(y1 - y0);
            float r_inner = r - 0.5f, r_outer = r + 0.5f;
            float r_inner_sq = (r_inner > 0) ? r_inner * r_inner : 0.0f;
            float r_outer_sq = r_outer * r_outer;

            for (int y = static_cast<int>(std::floor(min_y)); y <= static_cast<int>(std::ceil(max_y)); ++y) {
                for (int x = static_cast<int>(std::floor(min_x)); x <= static_cast<int>(std::ceil(max_x)); ++x) {
                    float px = x + 0.5f, py = y + 0.5f;
                    float t = (l2 > 0.0f) ? ((px - x0)*(x1 - x0) + (py - y0)*(y1 - y0)) / l2 : 0.0f;
                    if (t < 0.0f) t = 0.0f; else if (t > 1.0f) t = 1.0f;
                    
                    float proj_x = x0 + t * (x1 - x0), proj_y = y0 + t * (y1 - y0);
                    float dist_sq = (px - proj_x)*(px - proj_x) + (py - proj_y)*(py - proj_y);
                    
                    float coverage = (dist_sq <= r_inner_sq) ? 1.0f : (dist_sq >= r_outer_sq) ? 0.0f : 0.5f - (std::sqrt(dist_sq) - r);
                    if (coverage > 0.0f) stroke_pixel(x, y, color, coverage);
                }
            }
        }
    }

    void fill_rect_internal(int x, int y, int w, int h, uint32_t color) {
        if (w <= 0 || h <= 0) return;
        int x_end = std::min(width, x + w), y_end = std::min(height, y + h);
        int start_x = std::max(0, x), start_y = std::max(0, y);
        if (start_x >= x_end || start_y >= y_end) return;

        if ((color >> 24) == 255) {
            uint32_t* row = buffer + start_y * width + start_x;
            int rect_w = x_end - start_x;
            for (int cy = start_y; cy < y_end; ++cy) { std::fill(row, row + rect_w, color); row += width; }
        } else {
            for (int cy = start_y; cy < y_end; ++cy) {
                int idx = cy * width + start_x;
                for (int cx = start_x; cx < x_end; ++cx) {
                    buffer[idx] = blendColors(buffer[idx], color, 1.0f);
                    ++idx;
                }
            }
        }
    }

    void rect_internal(int x, int y, int w, int h, uint32_t color, float width) {
        line_internal(x, y, x + w, y, color, width);
        line_internal(x + w, y, x + w, y + h, color, width);
        line_internal(x + w, y + h, x, y + h, color, width);
        line_internal(x, y + h, x, y, color, width);
    }

    void fill_circle_internal(int cx, int cy, int r, uint32_t color) {
        if (r <= 0) return;
        float r_float = static_cast<float>(r);
        float r_outer = r_float + 0.5f, r_outer_sq = r_outer * r_outer;
        float r_inner = r_float - 0.5f, r_inner_sq = (r_inner > 0) ? r_inner * r_inner : 0.0f;

        for (int y = -r - 1; y <= r + 1; ++y) {
            float y_sq = static_cast<float>(y * y);
            if (y_sq > r_outer_sq) continue;
            int max_x = static_cast<int>(std::ceil(std::sqrt(r_outer_sq - y_sq)));
            for (int x = -max_x; x <= max_x; ++x) {
                float dist_sq = static_cast<float>(x * x + y * y);
                float coverage = (dist_sq <= r_inner_sq) ? 1.0f : (dist_sq >= r_outer_sq) ? 0.0f : 0.5f - (std::sqrt(dist_sq) - r_float);
                if (coverage > 0.0f) put_pixel_aa(cx + x, cy + y, color, coverage);
            }
        }
    }

    void circle_internal(int cx, int cy, int r, uint32_t color, float width) {
        if (r <= 0) return;
        float r_float = static_cast<float>(r);
        float r_outer = r_float + 1.0f, r_outer_sq = r_outer * r_outer;
        float r_inner = r_float - 1.0f, r_inner_sq = (r_inner > 0) ? r_inner * r_inner : 0.0f;

        for (int y = -r - 2; y <= r + 2; ++y) {
            float y_sq = static_cast<float>(y * y);
            if (y_sq > r_outer_sq) continue;
            int max_x = static_cast<int>(std::ceil(std::sqrt(r_outer_sq - y_sq)));
            for (int x = -max_x; x <= max_x; ++x) {
                float dist_sq = static_cast<float>(x * x + y * y);
                if (dist_sq <= r_outer_sq && dist_sq >= r_inner_sq) {
                    float dist_to_stroke = std::abs(std::sqrt(dist_sq) - r_float);
                    if (dist_to_stroke < 1.0f) put_pixel_aa(cx + x, cy + y, color, 1.0f - dist_to_stroke);
                }
            }
        }
    }

    void fill_arc_internal(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise, uint32_t color) {
        if (radius <= 0.0f) return;
        float two_pi = 6.28318530717958647692f;
        float diff = endAngle - startAngle;
        bool is_full_circle = std::abs(std::abs(diff) - two_pi) < 0.0001f;
        float effective_diff = diff;
        if (is_full_circle) effective_diff = counterclockwise ? -two_pi : two_pi;
        else {
            if (counterclockwise) while (effective_diff > 0) effective_diff -= two_pi;
            else while (effective_diff < 0) effective_diff += two_pi;
        }
        if (effective_diff == 0.0f && !is_full_circle) return;

        int r_int = static_cast<int>(std::ceil(radius));
        float r_outer = radius + 0.5f, r_outer_sq = r_outer * r_outer;

        for (int y = -r_int; y <= r_int; ++y) {
            float y_sq = static_cast<float>(y * y);
            if (y_sq > r_outer_sq) continue;
            int max_x = static_cast<int>(std::ceil(std::sqrt(r_outer_sq - y_sq)));
            for (int x = -max_x; x <= max_x; ++x) {
                float dist_sq = static_cast<float>(x * x + y * y);
                if (dist_sq <= r_outer_sq) {
                    bool in_range = is_full_circle || is_angle_in_range(std::atan2(static_cast<float>(y), static_cast<float>(x)), startAngle, endAngle, counterclockwise);
                    if (in_range) {
                        float dist_to_edge = std::sqrt(dist_sq) - radius;
                        float coverage = (dist_to_edge < -0.5f) ? 1.0f : (dist_to_edge > 0.5f) ? 0.0f : 0.5f - dist_to_edge;
                        if (coverage > 0.0f) put_pixel_aa(static_cast<int>(std::floor(cx)) + x, static_cast<int>(std::floor(cy)) + y, color, coverage);
                    }
                }
            }
        }
    }

    void arc_internal(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise, uint32_t color, float width) {
        if (radius <= 0.0f || width <= 0.0f) return;
        float two_pi = 6.28318530717958647692f;
        float diff = endAngle - startAngle;
        bool is_full_circle = std::abs(std::abs(diff) - two_pi) < 0.0001f;
        float effective_diff = diff;
        if (is_full_circle) effective_diff = counterclockwise ? -two_pi : two_pi;
        else {
            if (counterclockwise) while (effective_diff > 0) effective_diff -= two_pi;
            else while (effective_diff < 0) effective_diff += two_pi;
        }
        if (effective_diff == 0.0f && !is_full_circle) return;

        int steps = std::max(16, static_cast<int>(std::abs(effective_diff) * radius * 2.0f));
        float angleStep = effective_diff / steps;
        float prev_x = cx + radius * std::cos(startAngle), prev_y = cy + radius * std::sin(startAngle);
        
        for (int i = 1; i <= steps; ++i) {
            float currentAngle = startAngle + i * angleStep;
            float x = cx + radius * std::cos(currentAngle), y = cy + radius * std::sin(currentAngle);
            line_internal(prev_x, prev_y, x, y, color, width);
            prev_x = x; prev_y = y;
        }
    }

    void quadratic_curve_internal(float x0, float y0, float cx, float cy, float x1, float y1, uint32_t color, float width) {
        if (width <= 0.0f) return;
        float prev_x = x0, prev_y = y0;
        for (int i = 1; i <= 200; i++) {
            float t = static_cast<float>(i) / 200.0f, inv_t = 1.0f - t;
            float x = inv_t * inv_t * x0 + 2.0f * inv_t * t * cx + t * t * x1;
            float y = inv_t * inv_t * y0 + 2.0f * inv_t * t * cy + t * t * y1;
            line_internal(prev_x, prev_y, x, y, color, width);
            prev_x = x; prev_y = y;
        }
    }

    void cubic_curve_internal(float x0, float y0, float cx1, float cy1, float cx2, float cy2, float x1, float y1, uint32_t color, float width) {
        if (width <= 0.0f) return;
        float prev_x = x0, prev_y = y0;
        for (int i = 1; i <= 200; i++) {
            float t = static_cast<float>(i) / 200.0f, inv_t = 1.0f - t;
            float inv_t2 = inv_t * inv_t, inv_t3 = inv_t2 * inv_t, t2 = t * t, t3 = t2 * t;
            float x = inv_t3 * x0 + 3.0f * inv_t2 * t * cx1 + 3.0f * inv_t * t2 * cx2 + t3 * x1;
            float y = inv_t3 * y0 + 3.0f * inv_t2 * t * cy1 + 3.0f * inv_t * t2 * cy2 + t3 * y1;
            line_internal(prev_x, prev_y, x, y, color, width);
            prev_x = x; prev_y = y;
        }
    }

    // Even-odd polygon fill with 16x vertical supersampling and exact horizontal
    // span coverage. Coverage is accumulated per pixel across all sub-scanlines and
    // spans (so shared boundaries never double-blend), then blended once.
    void fill_path_internal(const Path2D& path, uint32_t color) {
        auto subpaths = flatten_path(path, 100);
        if (subpaths.empty()) return;

        float min_x = 1e9f, max_x = -1e9f, min_y = 1e9f, max_y = -1e9f;
        for (const auto& subpath : subpaths) {
            if (subpath.empty()) continue;
            for (const auto& p : subpath) {
                if (p.first < min_x) min_x = p.first;
                if (p.first > max_x) max_x = p.first;
                if (p.second < min_y) min_y = p.second;
                if (p.second > max_y) max_y = p.second;
            }
        }

        int start_y = std::max(0, static_cast<int>(std::floor(min_y)));
        int end_y = std::min(height - 1, static_cast<int>(std::ceil(max_y)));
        if (start_y > end_y || max_x < 0.0f || min_x > static_cast<float>(width)) return;

        struct Edge { float y_min, y_max, x_at_ymin, inv_slope; };
        std::vector<Edge> edges;
        edges.reserve(subpaths.size() * 128);
        for (const auto& sp : subpaths) {
            size_t n = sp.size();
            if (n < 2) continue;
            for (size_t i = 0; i < n; ++i) {
                float x1 = sp[i].first, y1 = sp[i].second;
                float x2 = sp[(i + 1) % n].first, y2 = sp[(i + 1) % n].second;
                if (y1 == y2) continue;
                if (y1 > y2) { std::swap(x1, x2); std::swap(y1, y2); }
                edges.push_back({y1, y2, x1, (x2 - x1) / (y2 - y1)});
            }
        }
        if (edges.empty()) return;

        constexpr int SUB = 16;
        constexpr float SUB_W = 1.0f / SUB;
        const float fw = static_cast<float>(width);

        const bool is_opaque = (color >> 24) == 255;
        std::vector<float> partial(static_cast<size_t>(width) + 2, 0.0f);
        std::vector<float> delta(static_cast<size_t>(width) + 2, 0.0f);
        std::vector<float> nodes;
        nodes.reserve(edges.size());

        for (int y = start_y; y <= end_y; ++y) {
            int row_min = width, row_max = -1;

            for (int s = 0; s < SUB; ++s) {
                float sy = y + (s + 0.5f) * SUB_W;
                nodes.clear();
                for (const auto& e : edges) {
                    if (sy >= e.y_min && sy < e.y_max) nodes.push_back(e.x_at_ymin + (sy - e.y_min) * e.inv_slope);
                }
                if (nodes.size() < 2) continue;
                std::sort(nodes.begin(), nodes.end());

                for (size_t i = 0; i + 1 < nodes.size(); i += 2) {
                    float l = nodes[i], r = nodes[i + 1];
                    if (l < 0.0f) l = 0.0f;
                    if (r > fw) r = fw;
                    if (r <= l) continue;

                    int ix0 = static_cast<int>(std::floor(l));
                    int ix1 = static_cast<int>(std::floor(r));
                    if (ix0 < row_min) row_min = ix0;
                    int last = std::min(ix1, width - 1);
                    if (last > row_max) row_max = last;

                    if (ix0 == ix1) {
                        partial[ix0] += (r - l) * SUB_W;
                    } else {
                        partial[ix0] += (static_cast<float>(ix0 + 1) - l) * SUB_W;
                        delta[ix0 + 1] += SUB_W;
                        delta[ix1] -= SUB_W;
                        partial[ix1] += (r - static_cast<float>(ix1)) * SUB_W;
                    }
                }
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
                    if (cov >= 0.998f) {
                        row[x] = is_opaque ? color : blendColors(row[x], color, 1.0f);
                    } else {
                        row[x] = blendColors(row[x], color, cov);
                    }
                }
            }
            // clear the tail entries touched beyond row_max (ix1 may equal width)
            partial[row_max + 1] = 0.0f; delta[row_max + 1] = 0.0f;
            if (row_max + 1 != width) { partial[width] = 0.0f; delta[width] = 0.0f; }
            partial[width + 1] = 0.0f; delta[width + 1] = 0.0f;
            run = 0.0f;
        }
    }

    void stroke_path_internal(const Path2D& path, uint32_t color, float width) {
        if (width <= 0.0f) return;
        float cx_pos = 0, cy_pos = 0;
        bool has_current = false;
        float start_x = 0, start_y = 0;

        for (const auto& cmd : path.commands) {
            if (cmd.type == 0) {
                cx_pos = cmd.x1; cy_pos = cmd.y1; start_x = cx_pos; start_y = cy_pos; has_current = true;
            } else if (cmd.type == 1) {
                if (has_current) line_internal(cx_pos, cy_pos, cmd.x1, cmd.y1, color, width);
                cx_pos = cmd.x1; cy_pos = cmd.y1; has_current = true;
            } else if (cmd.type == 2) {
                if (has_current) quadratic_curve_internal(cx_pos, cy_pos, cmd.x1, cmd.y1, cmd.x2, cmd.y2, color, width);
                cx_pos = cmd.x2; cy_pos = cmd.y2; has_current = true;
            } else if (cmd.type == 3) {
                if (has_current) cubic_curve_internal(cx_pos, cy_pos, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x3, cmd.y3, color, width);
                cx_pos = cmd.x3; cy_pos = cmd.y3; has_current = true;
            } else if (cmd.type == 5) {
                float arc_start_x = cmd.x1 + cmd.x2 * std::cos(cmd.y2);
                float arc_start_y = cmd.y1 + cmd.x2 * std::sin(cmd.y2);
                if (std::sqrt((cx_pos - cmd.x1)*(cx_pos - cmd.x1) + (cy_pos - cmd.y1)*(cy_pos - cmd.y1)) < 0.5f) {
                    start_x = arc_start_x; start_y = arc_start_y; cx_pos = arc_start_x; cy_pos = arc_start_y;
                }
                if (has_current) arc_internal(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x3, cmd.y3 >= 0.5f, color, width);
                cx_pos = cmd.x1 + cmd.x2 * std::cos(cmd.x3); cy_pos = cmd.y1 + cmd.x2 * std::sin(cmd.x3);
                has_current = true;
            } else if (cmd.type == 4) {
                if (has_current) {
                    float dx = cx_pos - start_x, dy = cy_pos - start_y;
                    if (std::sqrt(dx*dx + dy*dy) > 0.5f) line_internal(cx_pos, cy_pos, start_x, start_y, color, width);
                }
                cx_pos = start_x; cy_pos = start_y; has_current = true;
            }
        }
    }

public:
    Canvas2D(int w, int h) : width(w), height(h) {
        buffer = static_cast<uint32_t*>(std::malloc(static_cast<size_t>(width) * height * sizeof(uint32_t)));
        // Initialize with transparent black by default
        clear(rgba(0, 0, 0, 0));
    }

    ~Canvas2D() { std::free(buffer); }

    uint32_t* get_buffer() const { return buffer; }
    int get_width() const { return width; }
    int get_height() const { return height; }

    Canvas2D& fill_style(uint32_t color) { m_fill_style = color; return *this; }
    Canvas2D& stroke_style(uint32_t color) { m_stroke_style = color; return *this; }
    Canvas2D& line_width(float w) { m_line_width = w; return *this; }

    Canvas2D& clear(uint32_t color) {
        std::fill(buffer, buffer + static_cast<size_t>(width) * height, color);
        return *this;
    }

    Canvas2D& path(const Path2D& path) {
        if ((m_fill_style >> 24) > 0) fill_path_internal(path, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) {
            begin_stroke(m_stroke_style);
            stroke_path_internal(path, m_stroke_style, m_line_width);
            end_stroke();
        }
        return *this;
    }

    Canvas2D& rect(int x, int y, int w, int h) {
        if ((m_fill_style >> 24) > 0) fill_rect_internal(x, y, w, h, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) {
            begin_stroke(m_stroke_style);
            rect_internal(x, y, w, h, m_stroke_style, m_line_width);
            end_stroke();
        }
        return *this;
    }

    Canvas2D& circle(int cx, int cy, int r) {
        if ((m_fill_style >> 24) > 0) fill_circle_internal(cx, cy, r, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) circle_internal(cx, cy, r, m_stroke_style, m_line_width);
        return *this;
    }

    Canvas2D& arc(float cx, float cy, float radius, float startAngle, float endAngle, bool counterclockwise) {
        if ((m_fill_style >> 24) > 0) fill_arc_internal(cx, cy, radius, startAngle, endAngle, counterclockwise, m_fill_style);
        if ((m_stroke_style >> 24) > 0 && m_line_width > 0.0f) {
            begin_stroke(m_stroke_style);
            arc_internal(cx, cy, radius, startAngle, endAngle, counterclockwise, m_stroke_style, m_line_width);
            end_stroke();
        }
        return *this;
    }

    Canvas2D& line(float x0, float y0, float x1, float y1) {
        if (m_line_width > 0.0f && (m_stroke_style >> 24) > 0) {
            begin_stroke(m_stroke_style);
            line_internal(x0, y0, x1, y1, m_stroke_style, m_line_width);
            end_stroke();
        }
        return *this;
    }

    Canvas2D& quadratic_curve(float x0, float y0, float cx, float cy, float x1, float y1) {
        if (m_line_width > 0.0f && (m_stroke_style >> 24) > 0) {
            begin_stroke(m_stroke_style);
            quadratic_curve_internal(x0, y0, cx, cy, x1, y1, m_stroke_style, m_line_width);
            end_stroke();
        }
        return *this;
    }

    Canvas2D& cubic_curve(float x0, float y0, float cx1, float cy1, float cx2, float cy2, float x1, float y1) {
        if (m_line_width > 0.0f && (m_stroke_style >> 24) > 0) {
            begin_stroke(m_stroke_style);
            cubic_curve_internal(x0, y0, cx1, cy1, cx2, cy2, x1, y1, m_stroke_style, m_line_width);
            end_stroke();
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
            begin_stroke(m_stroke_style);
            for (int i = 0; i < num_points - 1; ++i) {
                line_internal(points[i * 2], points[i * 2 + 1], points[(i + 1) * 2], points[(i + 1) * 2 + 1], m_stroke_style, m_line_width);
            }
            line_internal(points[(num_points - 1) * 2], points[(num_points - 1) * 2 + 1], points[0], points[1], m_stroke_style, m_line_width);
            end_stroke();
        }
        return *this;
    }

    Canvas2D& fill_solid(uint32_t color) {
        std::fill(buffer, buffer + static_cast<size_t>(width) * height, color);
        return *this;
    }
};

#endif // CANVAS2D_HPP
