// ./slamAlgorithmsMapping.cpp
#ifndef SLAM_ALGORITHMS_MAPPING_CPP
#define SLAM_ALGORITHMS_MAPPING_CPP

#include <vector>
#include <cmath>
#include <algorithm>
#include <numeric>

extern int g_width, g_height;
extern float g_fx, g_fy, g_cx, g_cy;
extern std::vector<MapPoint> g_map;
extern std::vector<Keyframe> g_keyframes;
extern Mat3 g_current_R;
extern Vec3 g_current_t;
extern float g_scale_factor;
extern std::mt19937 g_rng;
extern int g_max_map_points;
extern int g_map_point_counter;

void local_bundle_adjustment(Keyframe& kf, std::vector<MapPoint>& map_points) {
    float R[9] = {kf.R.m[0], kf.R.m[1], kf.R.m[2], kf.R.m[3], kf.R.m[4], kf.R.m[5], kf.R.m[6], kf.R.m[7], kf.R.m[8]};
    float t[3] = {kf.t.x, kf.t.y, kf.t.z};

    for (int iter = 0; iter < 15; ++iter) {
        float JtJ[36] = {0};
        float Jte[6] = {0};
        int valid_count = 0;

        for (size_t i = 0; i < kf.pts3d.size(); ++i) {
            int mp_id = kf.map_point_ids[i];
            Vec3 X = (mp_id != -1 && mp_id < (int)map_points.size()) ? map_points[mp_id].pos : kf.pts3d[i];
            if (X.x == 0 && X.y == 0 && X.z == 0) continue;

            float Xc_x = R[0] * X.x + R[1] * X.y + R[2] * X.z + t[0];
            float Xc_y = R[3] * X.x + R[4] * X.y + R[5] * X.z + t[1];
            float Xc_z = R[6] * X.x + R[7] * X.y + R[8] * X.z + t[2];
            if (Xc_z < 1e-3f) continue;

            float x_proj = (Xc_x / Xc_z) * g_fx + g_cx;
            float y_proj = (Xc_y / Xc_z) * g_fy + g_cy;
            float x_obs = kf.kps[i].x;
            float y_obs = kf.kps[i].y;

            float ex = x_proj - x_obs;
            float ey = y_proj - y_obs;
            float err2 = ex * ex + ey * ey; 

            float w = 1.0f;
            if (err2 > 16.0f) w = sqrt(16.0f / err2); 

            float invZ = 1.0f / Xc_z;
            float X_Z = Xc_x * invZ;
            float Y_Z = Xc_y * invZ;

            float J[12];
            J[0] = w * g_fx * (-X_Z * Y_Z);
            J[1] = w * g_fx * (1.0f + X_Z * X_Z);
            J[2] = w * g_fx * (-Y_Z);
            J[3] = w * g_fx * invZ;
            J[4] = 0.0f;
            J[5] = w * g_fx * (-X_Z * invZ);
            J[6] = w * g_fy * (-(1.0f + Y_Z * Y_Z));
            J[7] = w * g_fy * (X_Z * Y_Z);
            J[8] = w * g_fy * X_Z;
            J[9] = 0.0f;
            J[10] = w * g_fy * invZ;
            J[11] = w * g_fy * (-Y_Z * invZ);

            for (int r = 0; r < 2; ++r) {
                for (int c = 0; c < 6; ++c) {
                    float j1 = J[r * 6 + c];
                    float weighted_e = (r == 0 ? ex : ey) * w;
                    Jte[c] += j1 * weighted_e;
                    for (int c2 = 0; c2 < 6; ++c2) JtJ[c * 6 + c2] += j1 * J[r * 6 + c2];
                }
            }
            valid_count++;
        }

        if (valid_count < 4) break;

        float A_mat[36], b_vec[6];
        for (int i = 0; i < 36; ++i) A_mat[i] = JtJ[i];
        for (int i = 0; i < 6; ++i) b_vec[i] = Jte[i];

        for (int i = 0; i < 6; ++i) {
            int max_row = i;
            for (int k = i + 1; k < 6; ++k) {
                if (fabs(A_mat[k * 6 + i]) > fabs(A_mat[max_row * 6 + i])) max_row = k;
            }
            for (int k = 0; k < 6; ++k) {
                float tmp = A_mat[i * 6 + k]; A_mat[i * 6 + k] = A_mat[max_row * 6 + k]; A_mat[max_row * 6 + k] = tmp;
            }
            float tmp = b_vec[i]; b_vec[i] = b_vec[max_row]; b_vec[max_row] = tmp;

            if (fabs(A_mat[i * 6 + i]) < 1e-8f) continue;
            for (int k = i + 1; k < 6; ++k) {
                float factor = A_mat[k * 6 + i] / A_mat[i * 6 + i];
                for (int j = i; j < 6; ++j) A_mat[k * 6 + j] -= factor * A_mat[i * 6 + j];
                b_vec[k] -= factor * b_vec[i];
            }
        }

        float delta[6] = {0};
        for (int i = 5; i >= 0; --i) {
            if (fabs(A_mat[i * 6 + i]) < 1e-8f) { delta[i] = 0; continue; }
            delta[i] = b_vec[i];
            for (int j = i + 1; j < 6; ++j) delta[i] -= A_mat[i * 6 + j] * delta[j];
            delta[i] /= A_mat[i * 6 + i];
        }

        t[0] -= delta[3]; t[1] -= delta[4]; t[2] -= delta[5];
        float wx = delta[0], wy = delta[1], wz = delta[2];

        float dR[9] = {1.0f, wz, -wy, -wz, 1.0f, wx, wy, -wx, 1.0f};
        float new_R[9] = {0};
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                new_R[i * 3 + j] = dR[i * 3 + 0] * R[0 * 3 + j] + dR[i * 3 + 1] * R[1 * 3 + j] + dR[i * 3 + 2] * R[2 * 3 + j];
            }
        }

        float U[9], S[3], V[9];
        svd3x3(new_R, U, S, V);
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                R[i * 3 + j] = U[i * 3 + 0] * V[j * 3 + 0] + U[i * 3 + 1] * V[j * 3 + 1] + U[i * 3 + 2] * V[j * 3 + 2];
            }
        }

        float det = det3x3(R);
        if (det < 0.0f) {
            V[2] = -V[2]; V[5] = -V[5]; V[8] = -V[8];
            for (int i = 0; i < 3; ++i) {
                for (int j = 0; j < 3; ++j) {
                    R[i * 3 + j] = U[i * 3 + 0] * V[j * 3 + 0] + U[i * 3 + 1] * V[j * 3 + 1] + U[i * 3 + 2] * V[j * 3 + 2];
                }
            }
        }

        for (size_t i = 0; i < kf.pts3d.size(); ++i) {
            int mp_id = kf.map_point_ids[i];
            Vec3 X = (mp_id != -1 && mp_id < (int)map_points.size()) ? map_points[mp_id].pos : kf.pts3d[i];
            if (X.x == 0 && X.y == 0 && X.z == 0) continue;

            float Xc_x = R[0] * X.x + R[1] * X.y + R[2] * X.z + t[0];
            float Xc_y = R[3] * X.x + R[4] * X.y + R[5] * X.z + t[1];
            float Xc_z = R[6] * X.x + R[7] * X.y + R[8] * X.z + t[2];
            if (Xc_z < 1e-3f) continue;

            float x_proj = (Xc_x / Xc_z) * g_fx + g_cx;
            float y_proj = (Xc_y / Xc_z) * g_fy + g_cy;
            float err_x = kf.kps[i].x - x_proj;
            float err_y = kf.kps[i].y - y_proj;

            float depth_update = (err_x * Xc_x + err_y * Xc_y) / (Xc_x * Xc_x + Xc_y * Xc_y + 1e-6f) * Xc_z;
            float new_Z = Xc_z + depth_update * 0.5f;

            if (new_Z > 0.1f) {
                float scale = new_Z / Xc_z;
                float Xc_x_new = Xc_x * scale;
                float Xc_y_new = Xc_y * scale;
                float Xc_z_new = new_Z;

                float invR[9] = {R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]};

                Vec3 X_new;
                X_new.x = invR[0] * (Xc_x_new - t[0]) + invR[1] * (Xc_y_new - t[1]) + invR[2] * (Xc_z_new - t[2]);
                X_new.y = invR[3] * (Xc_x_new - t[0]) + invR[4] * (Xc_y_new - t[1]) + invR[5] * (Xc_z_new - t[2]);
                X_new.z = invR[6] * (Xc_x_new - t[0]) + invR[7] * (Xc_y_new - t[1]) + invR[8] * (Xc_z_new - t[2]);

                if (mp_id != -1 && mp_id < (int)map_points.size()) {
                    map_points[mp_id].pos = X_new;
                } else {
                    kf.pts3d[i] = X_new;
                }
            }
        }
    }

    kf.R.m[0] = R[0]; kf.R.m[1] = R[1]; kf.R.m[2] = R[2];
    kf.R.m[3] = R[3]; kf.R.m[4] = R[4]; kf.R.m[5] = R[5];
    kf.R.m[6] = R[6]; kf.R.m[7] = R[7]; kf.R.m[8] = R[8];
    kf.t.x = t[0]; kf.t.y = t[1]; kf.t.z = t[2];
}

void cull_map_points(int max_points) {
    if (g_map.size() <= (size_t)max_points) return;

    std::vector<size_t> indices(g_map.size());
    std::iota(indices.begin(), indices.end(), 0);

    std::sort(indices.begin(), indices.end(), [&](size_t a, size_t b) {
        if (g_map[a].observations != g_map[b].observations) {
            return g_map[a].observations < g_map[b].observations;
        }
        return g_map[a].creation_index > g_map[b].creation_index;
    });

    size_t to_remove = g_map.size() - max_points;
    std::vector<bool> keep(g_map.size(), true);
    for (size_t i = 0; i < to_remove; ++i) {
        keep[indices[i]] = false;
    }

    std::vector<MapPoint> new_map;
    new_map.reserve(max_points);
    for (size_t i = 0; i < g_map.size(); ++i) {
        if (keep[i]) {
            new_map.push_back(g_map[i]);
        }
    }
    g_map = std::move(new_map);
}

#endif // SLAM_ALGORITHMS_MAPPING_CPP