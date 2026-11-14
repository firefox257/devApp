// ./slamAlgorithmsFeatures.cpp
#ifndef SLAM_ALGORITHMS_FEATURES_CPP
#define SLAM_ALGORITHMS_FEATURES_CPP
#include <iostream>
#include <vector>
#include <algorithm>
#include <cstdint>
#include <cmath>
#ifndef DEBUG
#define DEBUG
#endif

struct Keypoint { float x, y; float response; float angle; };
struct Descriptor { uint8_t data[32]; };
struct MapPoint {
    Vec3 pos;
    bool is_floor;
    int observations;
    int creation_index;
};
struct Keyframe {
    std::vector<Keypoint> kps;
    std::vector<Descriptor> descs;
    std::vector<Vec3> pts3d;
    std::vector<int> map_point_ids;
    Mat3 R;
    Vec3 t;
};
struct Match { int idx1; int idx2; float dist; };

extern int g_width, g_height;
extern float g_fx, g_fy, g_cx, g_cy;
extern std::vector<MapPoint> g_map;
extern std::vector<Keyframe> g_keyframes;
extern Mat3 g_current_R;
extern Vec3 g_current_t;
extern float g_scale_factor;
extern std::mt19937 g_rng;
extern int g_max_map_points;

static void transpose3x3(const float A[9], float AT[9]) {
    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            AT[i * 3 + j] = A[j * 3 + i];
        }
    }
}

static void multiply3x3(const float A[9], const float B[9], float C[9]) {
    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            C[i * 3 + j] = A[i * 3 + 0] * B[0 * 3 + j] + A[i * 3 + 1] * B[1 * 3 + j] + A[i * 3 + 2] * B[2 * 3 + j];
        }
    }
}

static void normalize_points_2d(const std::vector<Point2D>& pts, std::vector<Point2D>& out, float T[9]) {
    int n = (int)pts.size();
    float mx = 0.0f, my = 0.0f;
    if (n > 0) {
        for (const auto& p : pts) { mx += p.x; my += p.y; }
        mx /= (float)n; my /= (float)n;
    }
    float mean_dist = 0.0f;
    if (n > 0) {
        for (const auto& p : pts) {
            float dx = p.x - mx; float dy = p.y - my;
            mean_dist += sqrt(dx * dx + dy * dy);
        }
        mean_dist /= (float)n;
    }
    float scale = 1.0f;
    if (mean_dist > 1e-6f) scale = sqrt(2.0f) / mean_dist;
    T[0] = scale; T[1] = 0.0f;  T[2] = -scale * mx;
    T[3] = 0.0f;  T[4] = scale; T[5] = -scale * my;
    T[6] = 0.0f;  T[7] = 0.0f;  T[8] = 1.0f;
    out.resize(n);
    for (int i = 0; i < n; ++i) {
        out[i].x = scale * (pts[i].x - mx);
        out[i].y = scale * (pts[i].y - my);
    }
}

static void get_orb_pattern(int idx, int& x1, int& y1, int& x2, int& y2) {
    unsigned int seed = idx * 1103515245 + 12345;
    x1 = (seed % 31) - 15;
    seed = seed * 1103515245 + 12345;
    y1 = (seed % 31) - 15;
    seed = seed * 1103515245 + 12345;
    x2 = (seed % 31) - 15;
    seed = seed * 1103515245 + 12345;
    y2 = (seed % 31) - 15;
}

// ============================================================================
// REQ 1.9: SPATIAL BUCKETING - 8x8 grid, 5 keypoints per cell
// Ensures uniform distribution across the frame, preventing feature clustering
// in highly textured regions while guaranteeing coverage in sparse areas.
// ============================================================================
static void apply_spatial_bucketing(std::vector<Keypoint>& kps, int grid_size = 8, int max_per_cell = 5) {
    if (kps.empty()) return;
    
    float cell_w = (float)g_width / grid_size;
    float cell_h = (float)g_height / grid_size;
    
    std::vector<std::vector<Keypoint>> cells(grid_size * grid_size);
    
    for (const auto& kp : kps) {
        int cx = (int)(kp.x / cell_w);
        int cy = (int)(kp.y / cell_h);
        cx = std::max(0, std::min(grid_size - 1, cx));
        cy = std::max(0, std::min(grid_size - 1, cy));
        cells[cy * grid_size + cx].push_back(kp);
    }
    
    kps.clear();
    for (auto& cell : cells) {
        if (cell.empty()) continue;
        std::sort(cell.begin(), cell.end(), [](const Keypoint& a, const Keypoint& b) {
            return a.response > b.response;
        });
        int keep = std::min((int)cell.size(), max_per_cell);
        for (int i = 0; i < keep; ++i) {
            kps.push_back(cell[i]);
        }
    }
    
#ifdef DEBUG
    std::cout << "[DEBUG apply_spatial_bucketing] Keypoints after bucketing: " << kps.size() << std::endl;
#endif
}

void extract_features(const uint8_t* img, std::vector<Keypoint>& kps, std::vector<Descriptor>& descs) {
    int threshold = 20;
    int circle_x[16] = {0, 1, 2, 3, 3, 3, 2, 1, 0, -1, -2, -3, -3, -3, -2, -1};
    int circle_y[16] = {-3, -3, -2, -1, 0, 1, 2, 3, 3, 3, 2, 1, 0, -1, -2, -3};
    
    // INDUSTRY STANDARD: Increased margin to 16 to match the ±15 descriptor patch radius
    for (int y = 16; y < g_height - 16; ++y) {
        for (int x = 16; x < g_width - 16; ++x) {
            uint8_t p = img[y * g_width + x];
            
            bool is_corner = false;
            int bright_cont = 0, dark_cont = 0;
            
            for (int i = 0; i < 16; ++i) {
                uint8_t pi = img[(y + circle_y[i]) * g_width + (x + circle_x[i])];
                if (pi > p + threshold) {
                    bright_cont++;
                    if (bright_cont >= 9) { is_corner = true; break; }
                } else {
                    bright_cont = 0;
                }
            }
            
            if (!is_corner && bright_cont > 0) {
                for (int i = 0; i < 8; ++i) {
                    uint8_t pi = img[(y + circle_y[i]) * g_width + (x + circle_x[i])];
                    if (pi > p + threshold) {
                        bright_cont++;
                        if (bright_cont >= 9) { is_corner = true; break; }
                    } else {
                        break;
                    }
                }
            }
            
            if (!is_corner) {
                for (int i = 0; i < 16; ++i) {
                    uint8_t pi = img[(y + circle_y[i]) * g_width + (x + circle_x[i])];
                    if (pi < p - threshold) {
                        dark_cont++;
                        if (dark_cont >= 9) { is_corner = true; break; }
                    } else {
                        dark_cont = 0;
                    }
                }
                
                if (!is_corner && dark_cont > 0) {
                    for (int i = 0; i < 8; ++i) {
                        uint8_t pi = img[(y + circle_y[i]) * g_width + (x + circle_x[i])];
                        if (pi < p - threshold) {
                            dark_cont++;
                            if (dark_cont >= 9) { is_corner = true; break; }
                        } else {
                            break;
                        }
                    }
                }
            }
            
            if (is_corner) {
                // Intensity centroid for rotation-invariant orientation
                float m01 = 0, m10 = 0, m00 = 0;
                for (int dy = -7; dy <= 7; ++dy) {
                    for (int dx = -7; dx <= 7; ++dx) {
                        if (dx*dx + dy*dy <= 49) {
                            int px = x + dx;
                            int py = y + dy;
                            float val = img[py * g_width + px];
                            m00 += val;
                            m10 += dx * val;
                            m01 += dy * val;
                        }
                    }
                }
                float angle = (m00 > 1e-3f) ? atan2(m01, m10) : 0.0f;
                float response = (float)(bright_cont > dark_cont ? bright_cont : dark_cont);
                kps.push_back({(float)x, (float)y, response, angle});
            }
        }
    }
    
    // ========================================================================
    // REQ 1.9: Apply spatial bucketing BEFORE NMS and descriptor extraction
    // This guarantees uniform coverage across the frame, which is critical for
    // floor plane detection (floor must always have keypoints sampled).
    // ========================================================================
    apply_spatial_bucketing(kps, 8, 5);
    
#ifdef DEBUG
    std::cout << "[DEBUG extract_features] Found " << kps.size() << " keypoints after bucketing." << std::endl;
#endif
    
    // NMS to remove nearby duplicates within bucketed set
    std::vector<uint8_t> mask(g_width * g_height, 0);
    std::vector<Keypoint> nms_kps;
    nms_kps.reserve(std::min((size_t)500, kps.size()));
    for (const auto& kp : kps) {
        int x = (int)kp.x;
        int y = (int)kp.y;
        if (x >= 0 && x < g_width && y >= 0 && y < g_height) {
            if (!mask[y * g_width + x]) {
                nms_kps.push_back(kp);
                for (int dy = -3; dy <= 3; ++dy) {
                    for (int dx = -3; dx <= 3; ++dx) {
                        int ny = y + dy;
                        int nx = x + dx;
                        if (ny >= 0 && ny < g_height && nx >= 0 && nx < g_width) {
                            mask[ny * g_width + nx] = 1;
                        }
                    }
                }
            }
        }
        if (nms_kps.size() >= 500) break;
    }
    kps = std::move(nms_kps);
    
    // Compute descriptors
    descs.resize(kps.size());
    for (size_t i = 0; i < kps.size(); ++i) {
        int x = (int)kps[i].x;
        int y = (int)kps[i].y;
        float cos_a = cos(kps[i].angle);
        float sin_a = sin(kps[i].angle);
        
        for (int b = 0; b < 32; ++b) {
            uint8_t val = 0;
            for (int bit = 0; bit < 8; ++bit) {
                int pair_idx = b * 8 + bit;
                int px1, py1, px2, py2;
                get_orb_pattern(pair_idx, px1, py1, px2, py2);
                
                int rx1 = (int)(px1 * cos_a - py1 * sin_a);
                int ry1 = (int)(px1 * sin_a + py1 * cos_a);
                int rx2 = (int)(px2 * cos_a - py2 * sin_a);
                int ry2 = (int)(px2 * sin_a + py2 * cos_a);
                
                int x1 = std::max(0, std::min(g_width - 1, x + rx1));
                int y1 = std::max(0, std::min(g_height - 1, y + ry1));
                int x2 = std::max(0, std::min(g_width - 1, x + rx2));
                int y2 = std::max(0, std::min(g_height - 1, y + ry2));
                
                if (img[y1 * g_width + x1] < img[y2 * g_width + x2]) {
                    val |= (1 << bit);
                }
            }
            descs[i].data[b] = val;
        }
    }
}

void match_features(const std::vector<Descriptor>& d1, const std::vector<Descriptor>& d2, std::vector<Match>& matches) {
    int accepted = 0, rejected = 0;
    
    for (size_t i = 0; i < d1.size(); ++i) {
        int best1 = -1, best2 = -1;
        float dist1 = 256.0f, dist2 = 256.0f;
        
        for (size_t j = 0; j < d2.size(); ++j) {
            int dist = 0;
            for (int b = 0; b < 32; ++b) {
                dist += __builtin_popcount(d1[i].data[b] ^ d2[j].data[b]);
            }
            
            if (dist < dist1) { dist2 = dist1; best2 = best1; dist1 = dist; best1 = (int)j; }
            else if (dist < dist2) { dist2 = dist; best2 = (int)j; }
        }
        
        if (best1 != -1 && (dist1 == 0 || dist1 < 0.8f * dist2)) {
            matches.push_back({(int)i, best1, dist1}); accepted++;
        } else if (best1 != -1) { rejected++; }
    }
    
#ifdef DEBUG
    std::cout << "[DEBUG match_features] Accepted: " << accepted << ", Rejected by ratio: " << rejected << std::endl;
#endif
}

#endif // SLAM_ALGORITHMS_FEATURES_CPP