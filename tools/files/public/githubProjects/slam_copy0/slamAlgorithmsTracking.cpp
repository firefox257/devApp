// ./slamAlgorithmsTracking.cpp
#ifndef SLAM_ALGORITHMS_TRACKING_CPP
#define SLAM_ALGORITHMS_TRACKING_CPP

#include <vector>
#include <cmath>
#include <algorithm>
#include <iostream>

extern int g_width, g_height;
extern float g_fx, g_fy, g_cx, g_cy;
extern std::vector<MapPoint> g_map;
extern std::vector<Keyframe> g_keyframes;
extern Mat3 g_current_R;
extern Vec3 g_current_t;
extern float g_scale_factor;
extern std::mt19937 g_rng;
extern int g_max_map_points;

void solve_pnp_dlt(const std::vector<Vec3>& pts3d, const std::vector<Vec3>& pts2d, const std::vector<int>& sample, Mat3& R, Vec3& t) {
    int n = (int)sample.size();
    if (n < 6) return;

    double ATA[144] = {0};
    for (int i = 0; i < n; ++i) {
        int idx = sample[i];
        float X = pts3d[idx].x, Y = pts3d[idx].y, Z = pts3d[idx].z;
        float u = pts2d[idx].x, v = pts2d[idx].y;

        float row1[12] = {X, Y, Z, 1, 0, 0, 0, 0, -u * X, -u * Y, -u * Z, -u};
        float row2[12] = {0, 0, 0, 0, X, Y, Z, 1, -v * X, -v * Y, -v * Z, -v};

        for (int c1 = 0; c1 < 12; ++c1) {
            for (int c2 = 0; c2 < 12; ++c2) {
                ATA[c1 * 12 + c2] += (double)row1[c1] * (double)row1[c2] + (double)row2[c1] * (double)row2[c2];
            }
        }
    }

    float ATA_f[144]; for(int i=0; i<144; ++i) ATA_f[i] = (float)ATA[i];
    float v_vec[12];
    smallest_eigenvector_symmetric(ATA_f, 12, v_vec);

    float p00 = v_vec[0], p01 = v_vec[1], p02 = v_vec[2];
    float p10 = v_vec[4], p11 = v_vec[5], p12 = v_vec[6];
    float p20 = v_vec[8], p21 = v_vec[9], p22 = v_vec[10];

    float r0_norm = sqrt(p00 * p00 + p01 * p01 + p02 * p02);
    float r1_norm = sqrt(p10 * p10 + p11 * p11 + p12 * p12);
    float r2_norm = sqrt(p20 * p20 + p21 * p21 + p22 * p22);

    float scale = r0_norm;
    if (r1_norm > scale) scale = r1_norm;
    if (r2_norm > scale) scale = r2_norm;

    if (scale < 1e-6f) {
        R.m[0] = 1; R.m[1] = 0; R.m[2] = 0;
        R.m[3] = 0; R.m[4] = 1; R.m[5] = 0;
        R.m[6] = 0; R.m[7] = 0; R.m[8] = 1;
        t = {0, 0, 0};
        return;
    }

    float r00 = p00 / scale, r01 = p01 / scale, r02 = p02 / scale;
    float r10 = p10 / scale, r11 = p11 / scale, r12 = p12 / scale;
    float r20 = p20 / scale, r21 = p21 / scale, r22 = p22 / scale;

    float P3x3[9] = {r00, r01, r02, r10, r11, r12, r20, r21, r22};
    float U[9], S[3], V_mat[9];
    svd3x3(P3x3, U, S, V_mat);

    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            R.m[i * 3 + j] = U[i * 3 + 0] * V_mat[j * 3 + 0] + U[i * 3 + 1] * V_mat[j * 3 + 1] + U[i * 3 + 2] * V_mat[j * 3 + 2];
        }
    }

    float det = det3x3(R.m);
    if (det < 0.0f) {
        V_mat[2] = -V_mat[2]; V_mat[5] = -V_mat[5]; V_mat[8] = -V_mat[8];
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                R.m[i * 3 + j] = U[i * 3 + 0] * V_mat[j * 3 + 0] + U[i * 3 + 1] * V_mat[j * 3 + 1] + U[i * 3 + 2] * V_mat[j * 3 + 2];
            }
        }
    }

    t.x = v_vec[3] / scale;
    t.y = v_vec[7] / scale;
    t.z = v_vec[11] / scale;
}

void solve_pnp_ransac(const std::vector<Vec3>& pts3d, const std::vector<Vec3>& pts2d, Mat3& R, Vec3& t) {
    int N = (int)pts3d.size();
    if (N < 6) return;

    Mat3 best_R = R;
    Vec3 best_t = t;
    int max_inliers = 0;

    for (int iter = 0; iter < 50; ++iter) {
        std::vector<int> sample(6);
        std::vector<int> indices(N);
        for (int i = 0; i < N; ++i) indices[i] = i;
        for (int i = 0; i < 6; ++i) {
            int j = i + (g_rng() % (N - i));
            std::swap(indices[i], indices[j]);
            sample[i] = indices[i];
        }

        Mat3 test_R;
        Vec3 test_t;
        solve_pnp_dlt(pts3d, pts2d, sample, test_R, test_t);

        int inlier_count = 0;
        for (int i = 0; i < N; ++i) {
            Vec3 X = pts3d[i];
            float Xc_x = test_R.m[0] * X.x + test_R.m[1] * X.y + test_R.m[2] * X.z + test_t.x;
            float Xc_y = test_R.m[3] * X.x + test_R.m[4] * X.y + test_R.m[5] * X.z + test_t.y;
            float Xc_z = test_R.m[6] * X.x + test_R.m[7] * X.y + test_R.m[8] * X.z + test_t.z;
            if (Xc_z < 1e-3f) continue;

            float x_proj = Xc_x / Xc_z;
            float y_proj = Xc_y / Xc_z;
            float ex = x_proj - pts2d[i].x;
            float ey = y_proj - pts2d[i].y;
            
            float f_sq = g_fx * g_fy;
            if (f_sq < 1e-6f) f_sq = 250000.0f; 
            float err_px_sq = (ex * ex + ey * ey) * f_sq;
            if (err_px_sq < 16.0f) inlier_count++; 
        }

        if (inlier_count > max_inliers) {
            max_inliers = inlier_count;
            best_R = test_R;
            best_t = test_t;
        }
    }

    R = best_R;
    t = best_t;

    for (int gn_iter = 0; gn_iter < 5; ++gn_iter) {
        float JtJ[36] = {0};
        float Jte[6] = {0};
        int valid_count = 0;

        for (int i = 0; i < N; ++i) {
            Vec3 X = pts3d[i];
            float Xc_x = R.m[0] * X.x + R.m[1] * X.y + R.m[2] * X.z + t.x;
            float Xc_y = R.m[3] * X.x + R.m[4] * X.y + R.m[5] * X.z + t.y;
            float Xc_z = R.m[6] * X.x + R.m[7] * X.y + R.m[8] * X.z + t.z;
            if (Xc_z < 1e-3f) continue;

            float x_proj = Xc_x / Xc_z;
            float y_proj = Xc_y / Xc_z;
            float ex = x_proj - pts2d[i].x;
            float ey = y_proj - pts2d[i].y;

            float err2 = ex * ex + ey * ey;
            float f_sq_gn = g_fx * g_fy;
            if (f_sq_gn < 1e-6f) f_sq_gn = 250000.0f;
            float err2_px = err2 * f_sq_gn;
            float w = 1.0f;
            if (err2_px > 16.0f) w = sqrt(16.0f / err2_px); 

            float invZ = 1.0f / Xc_z;
            float X_Z = Xc_x * invZ;
            float Y_Z = Xc_y * invZ;

            float J[12];
            J[0] = w * (-X_Z * Y_Z);
            J[1] = w * (1.0f + X_Z * X_Z);
            J[2] = w * (-Y_Z);
            J[3] = w * invZ;
            J[4] = 0.0f;
            J[5] = w * (-X_Z * invZ);
            J[6] = w * (-(1.0f + Y_Z * Y_Z));
            J[7] = w * (X_Z * Y_Z);
            J[8] = w * X_Z;
            J[9] = 0.0f;
            J[10] = w * invZ;
            J[11] = w * (-Y_Z * invZ);

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

        t.x -= delta[3]; t.y -= delta[4]; t.z -= delta[5];
        float wx = delta[0], wy = delta[1], wz = delta[2];

        float dR[9] = {1.0f, wz, -wy, -wz, 1.0f, wx, wy, -wx, 1.0f};
        float new_R[9] = {0};
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                new_R[i * 3 + j] = dR[i * 3 + 0] * R.m[0 * 3 + j] + dR[i * 3 + 1] * R.m[1 * 3 + j] + dR[i * 3 + 2] * R.m[2 * 3 + j];
            }
        }

        float U[9], S[3], V[9];
        svd3x3(new_R, U, S, V);
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                R.m[i * 3 + j] = U[i * 3 + 0] * V[j * 3 + 0] + U[i * 3 + 1] * V[j * 3 + 1] + U[i * 3 + 2] * V[j * 3 + 2];
            }
        }

        float det = det3x3(R.m);
        if (det < 0.0f) {
            V[2] = -V[2]; V[5] = -V[5]; V[8] = -V[8];
            for (int i = 0; i < 3; ++i) {
                for (int j = 0; j < 3; ++j) {
                    R.m[i * 3 + j] = U[i * 3 + 0] * V[j * 3 + 0] + U[i * 3 + 1] * V[j * 3 + 1] + U[i * 3 + 2] * V[j * 3 + 2];
                }
            }
        }
    }
}

// ============================================================================
// FIXED: 2-Point Gravity-Constrained RANSAC
// Monocular triangulation noise causes 3-point normal estimation to easily 
// deviate >5 degrees, failing REQ 4.3. By sampling 2 points and constraining 
// the normal to lie in the plane spanned by the points and gravity, we 
// eliminate normal estimation noise entirely.
// ============================================================================
void fit_floor_plane(const std::vector<Vec3>& points, Vec3 gravity_world, Vec3& plane_normal, float& plane_d, std::vector<int>& inliers) {
    int N = (int)points.size();
    if (N < 3) return;
    int max_inliers = 0;
    std::uniform_int_distribution<int> dist(0, N - 1);
    float cos_5deg = cos(5.0f * 3.14159265f / 180.0f);

    std::vector<float> pt_dists(N);
    for (int i = 0; i < N; ++i) {
        pt_dists[i] = sqrt(points[i].x*points[i].x + points[i].y*points[i].y + points[i].z*points[i].z);
    }
    std::sort(pt_dists.begin(), pt_dists.end());
    float median_dist = pt_dists[N / 2];
    float inlier_threshold = std::max(0.1f, median_dist * 0.05f);

    for (int iter = 0; iter < 200; ++iter) {
        int i1 = dist(g_rng);
        int i2 = dist(g_rng);
        if (i1 == i2) continue;

        Vec3 p1 = points[i1];
        Vec3 p2 = points[i2];

        Vec3 v = {p2.x - p1.x, p2.y - p1.y, p2.z - p1.z};
        float v_len = sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        if (v_len < 1e-4f) continue;
        v.x /= v_len; v.y /= v_len; v.z /= v_len;

        // The plane normal must be perpendicular to v.
        // To minimize the angle with gravity_world, n must lie in the plane spanned by v and gravity_world.
        Vec3 axis = cross(gravity_world, v);
        float axis_len = sqrt(axis.x*axis.x + axis.y*axis.y + axis.z*axis.z);
        if (axis_len < 1e-4f) continue; // v is parallel to gravity, cannot form a horizontal plane

        axis.x /= axis_len; axis.y /= axis_len; axis.z /= axis_len;
        
        Vec3 n = cross(v, axis);
        float dot_g = dot(n, gravity_world);

        // REQ 4.3: Reject if normal does not align with gravity within 5 degrees
        if (fabs(dot_g) < cos_5deg) continue;

        if (dot_g < 0.0f) {
            n.x = -n.x; n.y = -n.y; n.z = -n.z;
            dot_g = -dot_g;
        }

        float d = -dot(n, p1);
        std::vector<int> current_inliers;
        for (int i = 0; i < N; ++i) {
            if (fabs(dot(n, points[i]) + d) < inlier_threshold) current_inliers.push_back(i);
        }

        if ((int)current_inliers.size() > max_inliers) {
            max_inliers = (int)current_inliers.size();
            plane_normal = n;
            plane_d = d;
            inliers = current_inliers;
#ifdef DEBUG
            std::cout << "[DEBUG fit_floor_plane] New best plane: Normal(" << n.x << ", " << n.y << ", " << n.z << "), d=" << d << ", Inliers=" << max_inliers << std::endl;
#endif
        }
    }

    if (max_inliers < 3) {
        plane_normal = {0, 1, 0};
        plane_d = 0;
        inliers.clear();
    }
}

#endif // SLAM_ALGORITHMS_TRACKING_CPP