// ./slamState.cpp
#ifndef SLAM_STATE_CPP
#define SLAM_STATE_CPP

#include <iostream>
#include <numeric>
#include <algorithm>
#include <cmath>
#include <autogen.hpp>

int g_width = 0, g_height = 0;
float g_fx = 0, g_fy = 0, g_cx = 0, g_cy = 0;
std::vector<MapPoint> g_map;
std::vector<Keyframe> g_keyframes;
std::vector<Vec3> g_floor_points;
Mat3 g_current_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
Vec3 g_current_t = {0, 0, 0};
float g_scale_factor = 1.0f;
std::mt19937 g_rng(42);
int g_max_map_points = 2000;
int g_map_point_counter = 0;
int g_frame_stride = 1;
int g_frame_counter = 0;
bool g_use_sliding_window = true;
int g_min_track_points = 15;
float g_tracking_distance_threshold = 0.25f;
float g_scanning_distance_threshold = 0.10f;
int g_relocalization_frames = 0;
int g_frames_since_last_keyframe = 0;
int g_last_keyframe_inliers = 0;
bool g_force_keyframe = false;
bool g_enable_denoising = true;

static int g_last_kp_count = 0;
static int g_last_match_count = 0;
static int g_last_inlier_count = 0;

static void apply_bilateral_filter(const uint8_t* in, uint8_t* out, int w, int h) {
    const float inv_ss2 = 0.05555f;
    const float inv_sc2 = 0.0005555f;
    float sw[5][5];
    for(int ky = -2; ky <= 2; ++ky) {
        for(int kx = -2; kx <= 2; ++kx) {
            sw[ky+2][kx+2] = exp(-(kx*kx + ky*ky) * inv_ss2);
        }
    }
    for (int y = 2; y < h - 2; ++y) {
        for (int x = 2; x < w - 2; ++x) {
            float center_val = (float)in[y * w + x];
            float sum_val = 0.0f;
            float sum_weight = 0.0f;
            for (int ky = 0; ky < 5; ++ky) {
                int ny = y + ky - 2;
                const uint8_t* row_ptr = &in[ny * w + x - 2];
                for (int kx = 0; kx < 5; ++kx) {
                    float val = (float)row_ptr[kx];
                    float dist_color = (val - center_val) * (val - center_val);
                    float weight = sw[ky][kx] * exp(-dist_color * inv_sc2);
                    sum_val += val * weight;
                    sum_weight += weight;
                }
            }
            out[y * w + x] = (uint8_t)(sum_val / sum_weight);
        }
    }
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            if (y < 2 || y >= h - 2 || x < 2 || x >= w - 2) {
                out[y * w + x] = in[y * w + x];
            }
        }
    }
}

Vec3 get_cam_center(const Mat3& R, const Vec3& t) {
    Vec3 C;
    C.x = -(R.m[0]*t.x + R.m[3]*t.y + R.m[6]*t.z);
    C.y = -(R.m[1]*t.x + R.m[4]*t.y + R.m[7]*t.z);
    C.z = -(R.m[2]*t.x + R.m[5]*t.y + R.m[8]*t.z);
    return C;
}

static void match_against_local_map(
    const std::vector<Keypoint>& current_kps,
    const std::vector<Descriptor>& current_descs,
    const std::vector<Keyframe>& keyframes,
    bool use_sliding_window,
    std::vector<Vec3>& out_pts3d,
    std::vector<Vec3>& out_pts2d
) {
    int start_idx = 0;
    int end_idx = (int)keyframes.size() - 1;
    if (use_sliding_window) {
        if (keyframes.size() > 5) {
            start_idx = keyframes.size() - 5;
        }
    } else {
        start_idx = end_idx;
    }

    for (int i = end_idx; i >= start_idx; --i) {
        const Keyframe& kf = keyframes[i];
        std::vector<Match> matches;
        match_features(kf.descs, current_descs, matches);

        for (const auto& m : matches) {
            int mp_id = kf.map_point_ids[m.idx1];
            if (mp_id != -1 && mp_id < (int)g_map.size()) {
                g_map[mp_id].observations++;
                Vec3 p3d = g_map[mp_id].pos;
                bool found = false;
                for (const auto& existing : out_pts3d) {
                    float dx = existing.x - p3d.x;
                    float dy = existing.y - p3d.y;
                    float dz = existing.z - p3d.z;
                    if (dx*dx + dy*dy + dz*dz < 0.001f) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    float x2 = (current_kps[m.idx2].x - g_cx) / g_fx;
                    float y2 = (current_kps[m.idx2].y - g_cy) / g_fy;
                    out_pts3d.push_back(p3d);
                    out_pts2d.push_back({x2, y2, 1.0f});
                }
            }
        }
        if (out_pts3d.size() >= 50) break;
    }
}

extern "C" {

ag_export(slam_init)
int slam_init(int width, int height, float fov_deg) {
    g_width = width;
    g_height = height;
    float fov_rad = fov_deg * 3.14159265f / 180.0f;
    g_fx = g_fy = (width / 2.0f) / tan(fov_rad / 2.0f);
    g_cx = width / 2.0f;
    g_cy = height / 2.0f;

    g_map.clear(); g_map.shrink_to_fit();
    g_keyframes.clear(); g_keyframes.shrink_to_fit();
    g_floor_points.clear(); g_floor_points.shrink_to_fit();

    g_current_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    g_current_t = {0, 0, 0};
    g_scale_factor = 1.0f;
    g_relocalization_frames = 0;
    g_frame_counter = 0;
    g_map_point_counter = 0;
    g_max_map_points = 2000;
    g_frame_stride = 1;
    g_use_sliding_window = true;
    g_min_track_points = 15;
    g_tracking_distance_threshold = 0.25f;
    g_scanning_distance_threshold = 0.10f;
    g_frames_since_last_keyframe = 0;
    g_last_keyframe_inliers = 0;
    g_force_keyframe = false;
    g_enable_denoising = true;
    g_last_kp_count = 0;
    g_last_match_count = 0;
    g_last_inlier_count = 0;
    g_rng.seed(42);

    return 0;
}

ag_export(slam_set_max_map_points)
void slam_set_max_map_points(int max_pts) { if (max_pts >= 0) g_max_map_points = max_pts; }

ag_export(slam_set_enable_denoising)
void slam_set_enable_denoising(bool enable) { g_enable_denoising = enable; }

ag_export(slam_force_keyframe)
void slam_force_keyframe() { g_force_keyframe = true; }

ag_export(slam_reset)
void slam_reset() {
    std::vector<MapPoint>().swap(g_map);
    std::vector<Keyframe>().swap(g_keyframes);
    std::vector<Vec3>().swap(g_floor_points);
    g_current_R = {1, 0, 0, 0, 1, 0, 0, 0, 1};
    g_current_t = {0, 0, 0};
    g_scale_factor = 1.0f;
    g_relocalization_frames = 0;
    g_frame_counter = 0;
    g_map_point_counter = 0;
    g_max_map_points = 2000;
    g_frame_stride = 1;
    g_use_sliding_window = true;
    g_min_track_points = 15;
    g_tracking_distance_threshold = 0.25f;
    g_scanning_distance_threshold = 0.10f;
    g_frames_since_last_keyframe = 0;
    g_last_keyframe_inliers = 0;
    g_force_keyframe = false;
    g_last_kp_count = 0;
    g_last_match_count = 0;
    g_last_inlier_count = 0;
    g_rng.seed(42);
}

ag_export(slam_set_frame_stride)
void slam_set_frame_stride(int stride) { if (stride > 0) g_frame_stride = stride; }

ag_export(slam_set_use_sliding_window)
void slam_set_use_sliding_window(bool use) { g_use_sliding_window = use; }

ag_export(slam_set_min_track_points)
void slam_set_min_track_points(int min_pts) { if (min_pts > 0) g_min_track_points = min_pts; }

ag_export(slam_set_tracking_distance_threshold)
void slam_set_tracking_distance_threshold(float dist) { if (dist > 0.0f) g_tracking_distance_threshold = dist; }

ag_export(slam_set_scanning_distance_threshold)
void slam_set_scanning_distance_threshold(float dist) { if (dist > 0.0f) g_scanning_distance_threshold = dist; }

ag_export(slam_get_current_rotation)
void slam_get_current_rotation(float* out_R) {
    for (int i = 0; i < 9; ++i) out_R[i] = g_current_R.m[i];
}

ag_export(slam_get_keypoint_count)
int slam_get_keypoint_count() { return g_last_kp_count; }

ag_export(slam_get_match_count)
int slam_get_match_count() { return g_last_match_count; }

ag_export(slam_get_inlier_count)
int slam_get_inlier_count() { return g_last_inlier_count; }

ag_export(slam_process_frame)
int slam_process_frame(
    const uint8_t* img_data,
    const float* imu_gravity,
    float* out_pose,
    int* out_pose_size
) {
    g_frame_counter++;
    Vec3 C_cur = get_cam_center(g_current_R, g_current_t);

    if (!g_use_sliding_window && ((g_frame_counter - 1) % g_frame_stride != 0)) {
        out_pose[0] = C_cur.x; out_pose[1] = C_cur.y; out_pose[2] = C_cur.z;
        *out_pose_size = 3;
        return 0;
    }

    float mean_lum = 0.0f;
    int sample_count = 0;
    for (int y = 0; y < g_height; y += 4) {
        for (int x = 0; x < g_width; x += 4) {
            mean_lum += img_data[y * g_width + x];
            sample_count++;
        }
    }
    mean_lum /= sample_count;

    const uint8_t* processed_img = img_data;
    uint8_t* denoised_buffer = nullptr;
    if (g_enable_denoising && mean_lum < 40.0f) {
        denoised_buffer = (uint8_t*)malloc(g_width * g_height);
        if (denoised_buffer) {
            apply_bilateral_filter(img_data, denoised_buffer, g_width, g_height);
            processed_img = denoised_buffer;
        }
    }

    std::vector<Keypoint> kps;
    std::vector<Descriptor> descs;
    extract_features(processed_img, kps, descs);
    g_last_kp_count = (int)kps.size();

    if (denoised_buffer) {
        free(denoised_buffer);
    }

    if (g_keyframes.empty()) {
        Keyframe kf;
        kf.kps = kps; kf.descs = descs;
        kf.R = g_current_R; kf.t = g_current_t;
        kf.pts3d.resize(kps.size(), {0, 0, 0});
        kf.map_point_ids.resize(kps.size(), -1);
        g_keyframes.push_back(kf);
        g_frames_since_last_keyframe = 0;
        g_last_keyframe_inliers = 0;

        out_pose[0] = C_cur.x; out_pose[1] = C_cur.y; out_pose[2] = C_cur.z;
        *out_pose_size = 3;
        return 0;
    }

    Keyframe& last_kf = g_keyframes.back();

    if (g_keyframes.size() == 1) {
        std::vector<Match> matches;
        match_features(last_kf.descs, descs, matches);
        g_last_match_count = (int)matches.size();

        std::cout << "[DEBUG slam_process_frame] Frame " << g_frame_counter
                  << ": KF=1, matches=" << matches.size() << std::endl;

        if (matches.size() > 15) {
            std::vector<Point2D> pts1_px, pts2_px;
            for (const auto& m : matches) {
                pts1_px.push_back({last_kf.kps[m.idx1].x, last_kf.kps[m.idx1].y});
                pts2_px.push_back({kps[m.idx2].x, kps[m.idx2].y});
            }
            Mat3 F; std::vector<int> f_inliers;
            compute_fundamental_ransac(pts1_px, pts2_px, F, f_inliers);
            std::cout << "[DEBUG] Fundamental RANSAC inliers: " << f_inliers.size() << std::endl;

            std::vector<Vec3> pts1, pts2;
            for (const auto& m : matches) {
                float x1 = (last_kf.kps[m.idx1].x - g_cx) / g_fx;
                float y1 = (last_kf.kps[m.idx1].y - g_cy) / g_fy;
                float x2 = (kps[m.idx2].x - g_cx) / g_fx;
                float y2 = (kps[m.idx2].y - g_cy) / g_fy;
                pts1.push_back({x1, y1, 1.0f});
                pts2.push_back({x2, y2, 1.0f});
            }

            Mat3 E; std::vector<int> inliers;
            compute_essential_ransac(pts1, pts2, E, inliers);
            g_last_inlier_count = (int)inliers.size();
            std::cout << "[DEBUG] Essential RANSAC inliers: " << inliers.size()
                      << " (need >= 6)" << std::endl;

            if (inliers.size() >= 6) {
                std::cout << "[DEBUG] Initializing 3D map with " << inliers.size()
                          << " inliers..." << std::endl;
                Mat3 R1, R2; Vec3 t1, t2;
                decompose_essential(E, R1, R2, t1, t2);

                int best_config = -1, max_positive_depth = 0;
                Mat3 best_R = R1; Vec3 best_t = t1;
                Mat3 R_configs[4] = {R1, R1, R2, R2};
                Vec3 t_configs[4] = {t1, t2, t1, t2};

                for (int c = 0; c < 4; ++c) {
                    int positive_depth = 0;
                    for (int i = 0; i < (int)inliers.size(); ++i) {
                        int orig_idx = inliers[i];
                        Vec3 X = triangulate(pts1[orig_idx], last_kf.R, last_kf.t,
                                             pts2[orig_idx], R_configs[c], t_configs[c]);
                        if (X.z > 0.1f) {
                            float Xc_z = R_configs[c].m[6] * X.x + R_configs[c].m[7] * X.y +
                                         R_configs[c].m[8] * X.z + t_configs[c].z;
                            if (Xc_z > 0.1f) positive_depth++;
                        }
                    }
                    std::cout << "[DEBUG] Config " << c << ": " << positive_depth
                              << " positive depth points" << std::endl;
                    if (positive_depth > max_positive_depth) {
                        max_positive_depth = positive_depth;
                        best_config = c; best_R = R_configs[c]; best_t = t_configs[c];
                    }
                }

                g_current_R = best_R; g_current_t = best_t;
                float t_len = sqrt(g_current_t.x * g_current_t.x +
                                   g_current_t.y * g_current_t.y +
                                   g_current_t.z * g_current_t.z);
                if (t_len > 1e-6f) {
                    g_current_t.x /= t_len; g_current_t.y /= t_len; g_current_t.z /= t_len;
                }

                last_kf.pts3d.resize(last_kf.kps.size(), {0, 0, 0});
                last_kf.map_point_ids.resize(last_kf.kps.size(), -1);
                int triangulated_count = 0;
                for (size_t i = 0; i < inliers.size(); ++i) {
                    int orig_idx = inliers[i];
                    Vec3 X = triangulate(pts1[orig_idx], last_kf.R, last_kf.t,
                                         pts2[orig_idx], g_current_R, g_current_t);
                    float z_last = last_kf.R.m[6] * X.x + last_kf.R.m[7] * X.y +
                                   last_kf.R.m[8] * X.z + last_kf.t.z;
                    float z_cur = g_current_R.m[6] * X.x + g_current_R.m[7] * X.y +
                                  g_current_R.m[8] * X.z + g_current_t.z;
                    if (z_last > 0.1f && z_cur > 0.1f) {
                        int new_id = (int)g_map.size();
                        g_map.push_back({X, false, 1, g_map_point_counter++});
                        last_kf.pts3d[matches[orig_idx].idx1] = X;
                        last_kf.map_point_ids[matches[orig_idx].idx1] = new_id;
                        triangulated_count++;
                    }
                }
                std::cout << "[DEBUG] Triangulated " << triangulated_count
                          << " 3D points" << std::endl;
                g_keyframes.back() = last_kf;

                Keyframe kf2;
                kf2.kps = kps;
                kf2.descs = descs;
                kf2.R = g_current_R;
                kf2.t = g_current_t;
                kf2.pts3d.resize(kps.size(), {0, 0, 0});
                kf2.map_point_ids.resize(kps.size(), -1);
                for (size_t i = 0; i < inliers.size(); ++i) {
                    int orig_idx = inliers[i];
                    int kf1_idx = matches[orig_idx].idx1;
                    int kf2_idx = matches[orig_idx].idx2;
                    int mp_id = last_kf.map_point_ids[kf1_idx];
                    if (mp_id != -1 && mp_id < (int)g_map.size()) {
                        kf2.pts3d[kf2_idx] = g_map[mp_id].pos;
                        kf2.map_point_ids[kf2_idx] = mp_id;
                        g_map[mp_id].observations++;
                    }
                }
                g_keyframes.push_back(kf2);
                g_frames_since_last_keyframe = 0;
                g_last_keyframe_inliers = (int)inliers.size();
                std::cout << "[DEBUG] ✅ Keyframe 2 created! Map points: "
                          << g_map.size() << std::endl;

                out_pose[0] = C_cur.x; out_pose[1] = C_cur.y; out_pose[2] = C_cur.z;
                *out_pose_size = 3;
                return 0;
            } else {
                std::cout << "[DEBUG] ❌ Not enough inliers (" << inliers.size()
                          << ") to initialize map" << std::endl;
            }
        } else {
            std::cout << "[DEBUG] ❌ Not enough matches (" << matches.size()
                      << ") to attempt initialization" << std::endl;
        }
    } else {
        std::vector<Vec3> pts3d_valid, pts2d_valid;
        match_against_local_map(kps, descs, g_keyframes, g_use_sliding_window, pts3d_valid, pts2d_valid);

        int current_inliers = 0;
        if (pts3d_valid.size() >= 6) {
            solve_pnp_ransac(pts3d_valid, pts2d_valid, g_current_R, g_current_t);
            for (size_t i = 0; i < pts3d_valid.size(); ++i) {
                Vec3 X = pts3d_valid[i];
                float Xc_x = g_current_R.m[0]*X.x + g_current_R.m[1]*X.y + g_current_R.m[2]*X.z + g_current_t.x;
                float Xc_y = g_current_R.m[3]*X.x + g_current_R.m[4]*X.y + g_current_R.m[5]*X.z + g_current_t.y;
                float Xc_z = g_current_R.m[6]*X.x + g_current_R.m[7]*X.y + g_current_R.m[8]*X.z + g_current_t.z;
                if (Xc_z > 1e-3f) {
                    float x_proj = Xc_x / Xc_z;
                    float y_proj = Xc_y / Xc_z;
                    float ex = x_proj - pts2d_valid[i].x;
                    float ey = y_proj - pts2d_valid[i].y;
                    float f_sq = g_fx * g_fy;
                    if (f_sq < 1e-6f) f_sq = 250000.0f;
                    float err_px_sq = (ex*ex + ey*ey) * f_sq;
                    if (err_px_sq < 16.0f) current_inliers++;
                }
            }
        }
        g_last_inlier_count = current_inliers;

        Vec3 g_meas = {imu_gravity[0], imu_gravity[1], imu_gravity[2]};
        g_meas = normalize(g_meas);
        Vec3 target_y = {-g_meas.x, -g_meas.y, -g_meas.z};
        target_y = normalize(target_y);

        Vec3 z_axis = {g_current_R.m[2], g_current_R.m[5], g_current_R.m[8]};
        Vec3 x_axis = cross(target_y, z_axis);
        x_axis = normalize(x_axis);
        z_axis = cross(x_axis, target_y);
        z_axis = normalize(z_axis);

        g_current_R.m[0] = x_axis.x; g_current_R.m[1] = target_y.x; g_current_R.m[2] = z_axis.x;
        g_current_R.m[3] = x_axis.y; g_current_R.m[4] = target_y.y; g_current_R.m[5] = z_axis.y;
        g_current_R.m[6] = x_axis.z; g_current_R.m[7] = target_y.z; g_current_R.m[8] = z_axis.z;

        if (current_inliers < g_min_track_points) {
            g_relocalization_frames++;
            if (g_relocalization_frames > 30) return -1;

            bool relocalized = false;
            for (int kf_idx = (int)g_keyframes.size() - 1; kf_idx >= 0; --kf_idx) {
                Keyframe& kf = g_keyframes[kf_idx];
                std::vector<Match> relo_matches;
                match_features(kf.descs, descs, relo_matches);
                std::vector<Vec3> relo_pts3d, relo_pts2d;
                for (const auto& m : relo_matches) {
                    int mp_id = kf.map_point_ids[m.idx1];
                    if (mp_id != -1 && mp_id < (int)g_map.size()) {
                        g_map[mp_id].observations++;
                        float x2 = (kps[m.idx2].x - g_cx) / g_fx;
                        float y2 = (kps[m.idx2].y - g_cy) / g_fy;
                        relo_pts3d.push_back(g_map[mp_id].pos);
                        relo_pts2d.push_back({x2, y2, 1.0f});
                    }
                }
                if (relo_pts3d.size() >= 6) {
                    Mat3 relo_R = kf.R; Vec3 relo_t = kf.t;
                    solve_pnp_ransac(relo_pts3d, relo_pts2d, relo_R, relo_t);
                    int relo_inliers = 0;
                    for (size_t i = 0; i < relo_pts3d.size(); ++i) {
                        Vec3 X = relo_pts3d[i];
                        float Xc_x = relo_R.m[0]*X.x + relo_R.m[1]*X.y + relo_R.m[2]*X.z + relo_t.x;
                        float Xc_y = relo_R.m[3]*X.x + relo_R.m[4]*X.y + relo_R.m[5]*X.z + relo_t.y;
                        float Xc_z = relo_R.m[6]*X.x + relo_R.m[7]*X.y + relo_R.m[8]*X.z + relo_t.z;
                        if (Xc_z > 1e-3f) {
                            float x_proj = Xc_x / Xc_z;
                            float y_proj = Xc_y / Xc_z;
                            float ex = x_proj - relo_pts2d[i].x;
                            float ey = y_proj - relo_pts2d[i].y;
                            float f_sq_relo = g_fx * g_fy;
                            if (f_sq_relo < 1e-6f) f_sq_relo = 250000.0f;
                            float err_px_sq = (ex*ex + ey*ey) * f_sq_relo;
                            if (err_px_sq < 16.0f) relo_inliers++;
                        }
                    }
                    if (relo_inliers >= g_min_track_points) {
                        g_current_R = relo_R; g_current_t = relo_t;
                        current_inliers = relo_inliers;
                        relocalized = true;
                        g_relocalization_frames = 0;
                        break;
                    }
                }
            }
        } else {
            g_relocalization_frames = 0;
        }

        bool should_add_keyframe = g_force_keyframe;
        g_force_keyframe = false;

        C_cur = get_cam_center(g_current_R, g_current_t);
        Vec3 C_last = get_cam_center(last_kf.R, last_kf.t);
        float dx = C_cur.x - C_last.x;
        float dy = C_cur.y - C_last.y;
        float dz = C_cur.z - C_last.z;
        float dist = sqrt(dx * dx + dy * dy + dz * dz);

        float trace = 0.0f;
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                trace += g_current_R.m[i * 3 + j] * last_kf.R.m[i * 3 + j];
            }
        }
        float cos_theta = (trace - 1.0f) / 2.0f;
        cos_theta = std::max(-1.0f, std::min(1.0f, cos_theta));
        float theta = acos(cos_theta) * 180.0f / 3.14159265f;

        g_frames_since_last_keyframe++;
        if (g_frames_since_last_keyframe >= 20) {
            if (dist > g_tracking_distance_threshold || theta > 15.0f) {
                should_add_keyframe = true;
            }
            else if (g_last_keyframe_inliers > 0 && current_inliers < 0.5f * g_last_keyframe_inliers) {
                should_add_keyframe = true;
            }
        }

        if (should_add_keyframe) {
            g_frames_since_last_keyframe = 0;
            g_last_keyframe_inliers = current_inliers;

            Keyframe kf;
            kf.kps = kps; kf.descs = descs;
            kf.R = g_current_R; kf.t = g_current_t;
            kf.pts3d.resize(kps.size(), {0, 0, 0});
            kf.map_point_ids.resize(kps.size(), -1);

            std::vector<Match> new_matches;
            match_features(last_kf.descs, descs, new_matches);
            for (const auto& m : new_matches) {
                float x1 = (last_kf.kps[m.idx1].x - g_cx) / g_fx;
                float y1 = (last_kf.kps[m.idx1].y - g_cy) / g_fy;
                float x2 = (kps[m.idx2].x - g_cx) / g_fx;
                float y2 = (kps[m.idx2].y - g_cy) / g_fy;
                Vec3 X = triangulate({x1, y1, 1.0f}, last_kf.R, last_kf.t, {x2, y2, 1.0f}, kf.R, kf.t);
                float z_last = last_kf.R.m[6] * X.x + last_kf.R.m[7] * X.y + last_kf.R.m[8] * X.z + last_kf.t.z;
                float z_new = kf.R.m[6] * X.x + kf.R.m[7] * X.y + kf.R.m[8] * X.z + kf.t.z;
                if (z_last > 0.1f && z_new > 0.1f) {
                    int new_id = (int)g_map.size();
                    g_map.push_back({X, false, 1, g_map_point_counter++});
                    kf.pts3d[m.idx2] = X;
                    kf.map_point_ids[m.idx2] = new_id;
                }
            }

            local_bundle_adjustment(kf, g_map);
            g_keyframes.push_back(kf);

            if (g_keyframes.size() > 60) {
                int worst_idx = -1;
                float min_utility = 1e9f;
                size_t start_idx = std::min((size_t)10, g_keyframes.size());
                for (size_t i = start_idx; i < g_keyframes.size(); ++i) {
                    int obs_count = 0;
                    for (int mp_id : g_keyframes[i].map_point_ids) {
                        if (mp_id != -1 && mp_id < (int)g_map.size()) {
                            obs_count += g_map[mp_id].observations;
                        }
                    }
                    float min_dist = 1e9f;
                    Vec3 c_i = get_cam_center(g_keyframes[i].R, g_keyframes[i].t);
                    for (size_t j = start_idx; j < g_keyframes.size(); ++j) {
                        if (i == j) continue;
                        Vec3 c_j = get_cam_center(g_keyframes[j].R, g_keyframes[j].t);
                        float d = sqrt(pow(c_i.x - c_j.x, 2) + pow(c_i.y - c_j.y, 2) + pow(c_i.z - c_j.z, 2));
                        if (d < min_dist) min_dist = d;
                    }
                    float age_penalty = (float)(g_keyframes.size() - i) / (float)g_keyframes.size();
                    float utility = (float)obs_count * 0.5f + min_dist * 0.3f + age_penalty * 0.2f;
                    if (utility < min_utility) {
                        min_utility = utility;
                        worst_idx = i;
                    }
                }
                if (worst_idx != -1) {
                    for (int mp_id : g_keyframes[worst_idx].map_point_ids) {
                        if (mp_id != -1 && mp_id < (int)g_map.size()) {
                            g_map[mp_id].observations--;
                        }
                    }
                    g_keyframes.erase(g_keyframes.begin() + worst_idx);
                }
            }
        }

        cull_map_points(g_max_map_points);

        out_pose[0] = C_cur.x;
        out_pose[1] = C_cur.y;
        out_pose[2] = C_cur.z;
        *out_pose_size = 3;
        return 0;
    }

    out_pose[0] = C_cur.x; out_pose[1] = C_cur.y; out_pose[2] = C_cur.z;
    *out_pose_size = 3;
    return 0;
}

ag_export(slam_get_floor_plane)
int slam_get_floor_plane(const float* imu_gravity, float* out_plane, int* out_hull_size, float* out_hull) {
    // imu_gravity is expected to point DOWN in camera frame
    Vec3 g_cam = {imu_gravity[0], imu_gravity[1], imu_gravity[2]};
    Vec3 g_world;
    g_world.x = g_current_R.m[0]*g_cam.x + g_current_R.m[3]*g_cam.y + g_current_R.m[6]*g_cam.z;
    g_world.y = g_current_R.m[1]*g_cam.x + g_current_R.m[4]*g_cam.y + g_current_R.m[7]*g_cam.z;
    g_world.z = g_current_R.m[2]*g_cam.x + g_current_R.m[5]*g_cam.y + g_current_R.m[8]*g_cam.z;
    g_world = normalize(g_world);

    // fit_floor_plane expects the gravity vector to align with the desired normal direction (UP)
    Vec3 up_world = {-g_world.x, -g_world.y, -g_world.z};

    std::vector<Vec3> pts;
    pts.reserve(g_map.size());
    for (const auto& mp : g_map) pts.push_back(mp.pos);

    Vec3 normal; float d; std::vector<int> inliers;
    fit_floor_plane(pts, up_world, normal, d, inliers);

    out_plane[0] = normal.x; out_plane[1] = normal.y; out_plane[2] = normal.z; out_plane[3] = d;

    Vec3 up = normal;
    Vec3 right = normalize(cross(up, Vec3{0, 0, 1}));
    if (right.x == 0 && right.y == 0 && right.z == 0) right = normalize(cross(up, Vec3{1, 0, 0}));
    Vec3 forward = normalize(cross(right, up));

    std::vector<Point2D> pts_2d;
    pts_2d.reserve(inliers.size());
    for (int idx : inliers) {
        Vec3 p = pts[idx];
        pts_2d.push_back({dot(p, right), dot(p, forward)});
    }

    float alpha = 0.5f;
    if (pts_2d.size() >= 3) {
        float max_dist = 0.0f;
        for (size_t i = 0; i < pts_2d.size(); ++i) {
            for (size_t j = i + 1; j < pts_2d.size(); ++j) {
                float dx = pts_2d[i].x - pts_2d[j].x;
                float dy = pts_2d[i].y - pts_2d[j].y;
                float dist = sqrt(dx*dx + dy*dy);
                if (dist > max_dist) max_dist = dist;
            }
        }
        alpha = std::max(0.5f, max_dist * 0.2f);
    }

    std::vector<Point2D> hull = compute_concave_hull(pts_2d, alpha);
    if (hull.size() < 3) {
        hull = compute_convex_hull(pts_2d);
    }

    *out_hull_size = (int)hull.size();
    for (size_t i = 0; i < hull.size(); ++i) {
        Vec3 p3d = {
            right.x * hull[i].x + forward.x * hull[i].y + up.x * (-d),
            right.y * hull[i].x + forward.y * hull[i].y + up.y * (-d),
            right.z * hull[i].x + forward.z * hull[i].y + up.z * (-d)
        };
        out_hull[i * 3 + 0] = p3d.x;
        out_hull[i * 3 + 1] = p3d.y;
        out_hull[i * 3 + 2] = p3d.z;
    }

    g_floor_points.clear();
    g_floor_points.reserve(inliers.size());
    for (int idx : inliers) {
        g_floor_points.push_back(pts[idx]);
    }

    return 0;
}

ag_export(slam_get_floor_point_count)
int slam_get_floor_point_count() { return (int)g_floor_points.size(); }

ag_export(slam_get_floor_point)
void slam_get_floor_point(int index, float* out_x, float* out_y, float* out_z) {
    if (index >= 0 && index < (int)g_floor_points.size()) {
        *out_x = g_floor_points[index].x;
        *out_y = g_floor_points[index].y;
        *out_z = g_floor_points[index].z;
    } else {
        *out_x = 0.0f; *out_y = 0.0f; *out_z = 0.0f;
    }
}

ag_export(slam_calibrate_scale)
void slam_calibrate_scale(float p1_x, float p1_y, float p1_z, float p2_x, float p2_y, float p2_z, float real_distance) {
    float dx = p2_x - p1_x;
    float dy = p2_y - p1_y;
    float dz = p2_z - p1_z;
    float map_dist = sqrt(dx*dx + dy*dy + dz*dz);
    if (map_dist > 1e-6f) {
        g_scale_factor = real_distance / map_dist;
        for (auto& mp : g_map) {
            mp.pos.x *= g_scale_factor; mp.pos.y *= g_scale_factor; mp.pos.z *= g_scale_factor;
        }
        for (auto& kf : g_keyframes) {
            kf.t.x *= g_scale_factor; kf.t.y *= g_scale_factor; kf.t.z *= g_scale_factor;
            for (auto& pt : kf.pts3d) {
                pt.x *= g_scale_factor; pt.y *= g_scale_factor; pt.z *= g_scale_factor;
            }
        }
        g_current_t.x *= g_scale_factor; g_current_t.y *= g_scale_factor; g_current_t.z *= g_scale_factor;
        for (auto& fp : g_floor_points) {
            fp.x *= g_scale_factor; fp.y *= g_scale_factor; fp.z *= g_scale_factor;
        }
    }
}

ag_export(slam_get_scale_factor)
float slam_get_scale_factor() { return g_scale_factor; }

ag_export(slam_free_ptr)
void slam_free_ptr(void* ptr) { free(ptr); }

ag_export(slam_get_keyframe_count)
int slam_get_keyframe_count() { return (int)g_keyframes.size(); }

ag_export(slam_get_map_point_count)
int slam_get_map_point_count() { return (int)g_map.size(); }

ag_export(slam_add_test_point)
void slam_add_test_point(float x, float y, float z) {
    g_map.push_back({{x, y, z}, false, 1, g_map_point_counter++});
    cull_map_points(g_max_map_points);
}

ag_export(slam_get_camera_pose16)
int slam_get_camera_pose16(float* out_m4) {
    if (!out_m4) return -1;
    Vec3 C = get_cam_center(g_current_R, g_current_t);
    const float r00 = g_current_R.m[0];
    const float r01 = g_current_R.m[1];
    const float r02 = g_current_R.m[2];
    const float r10 = g_current_R.m[3];
    const float r11 = g_current_R.m[4];
    const float r12 = g_current_R.m[5];
    const float r20 = g_current_R.m[6];
    const float r21 = g_current_R.m[7];
    const float r22 = g_current_R.m[8];

    out_m4[0]  = r00;
    out_m4[1]  = r01;
    out_m4[2]  = r02;
    out_m4[3]  = 0.0f;

    out_m4[4]  = r10;
    out_m4[5]  = r11;
    out_m4[6]  = r12;
    out_m4[7]  = 0.0f;

    out_m4[8]  = r20;
    out_m4[9]  = r21;
    out_m4[10] = r22;
    out_m4[11] = 0.0f;

    out_m4[12] = C.x;
    out_m4[13] = C.y;
    out_m4[14] = C.z;
    out_m4[15] = 1.0f;

    return 0;
}

ag_export(slam_get_map_points_xyz)
int slam_get_map_points_xyz(float* out_pts, int max_points) {
    if (!out_pts || max_points <= 0) return 0;
    int n = (int)g_map.size();
    if (n > max_points) n = max_points;
    for (int i = 0; i < n; ++i) {
        out_pts[i * 3 + 0] = g_map[i].pos.x;
        out_pts[i * 3 + 1] = g_map[i].pos.y;
        out_pts[i * 3 + 2] = g_map[i].pos.z;
    }
    return n;
}

ag_export(extract_keypoints_from_image)
int extract_keypoints_from_image(uint8_t* img_data, int width, int height, float** out_kps_ptr, int* out_count) {
    g_width = width;
    g_height = height;
    std::vector<Keypoint> kps;
    std::vector<Descriptor> descs;
    extract_features(img_data, kps, descs);
    *out_count = (int)kps.size();
    if (kps.size() > 0) {
        *out_kps_ptr = (float*)malloc(kps.size() * 2 * sizeof(float));
        for(int i = 0; i < (int)kps.size(); ++i) {
            (*out_kps_ptr)[i * 2]     = kps[i].x;
            (*out_kps_ptr)[i * 2 + 1] = kps[i].y;
        }
    } else {
        *out_kps_ptr = nullptr;
    }
    return 0;
}

ag_export(free_keypoints_buffer)
void free_keypoints_buffer(float* ptr) {
    if (ptr) free(ptr);
}

} // extern "C"

#endif // SLAM_STATE_CPP