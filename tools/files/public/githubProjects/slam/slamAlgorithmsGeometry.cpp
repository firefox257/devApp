// ./slamAlgorithmsGeometry.cpp
#ifndef SLAM_ALGORITHMS_GEOMETRY_CPP
#define SLAM_ALGORITHMS_GEOMETRY_CPP

#include <vector>
#include <cmath>
#include <algorithm>

extern int g_width, g_height;
extern float g_fx, g_fy, g_cx, g_cy;
extern std::vector<MapPoint> g_map;
extern std::vector<Keyframe> g_keyframes;
extern Mat3 g_current_R;
extern Vec3 g_current_t;
extern float g_scale_factor;
extern std::mt19937 g_rng;
extern int g_max_map_points;

static void smallest_eigenvector_symmetric(const float* A, int n, float* out_v) {
    double M[144];
    double V[144];
    for (int i = 0; i < n * n; ++i) { M[i] = A[i]; V[i] = 0.0; }
    for (int i = 0; i < n; ++i) V[i * n + i] = 1.0;

    for (int sweep = 0; sweep < 50; ++sweep) {
        double off = 0.0;
        for (int p = 0; p < n; ++p) {
            for (int q = p + 1; q < n; ++q) { off += fabs(M[p * n + q]); }
        }
        if (off < 1e-15) break;

        for (int p = 0; p < n - 1; ++p) {
            for (int q = p + 1; q < n; ++q) {
                double apq = M[p * n + q];
                if (fabs(apq) < 1e-15) continue;
                double app = M[p * n + p];
                double aqq = M[q * n + q];
                double theta = (aqq - app) / (2.0 * apq);
                double t = (theta >= 0.0 ? 1.0 : -1.0) / (fabs(theta) + sqrt(theta * theta + 1.0));
                double c = 1.0 / sqrt(t * t + 1.0);
                double s = t * c;

                for (int k = 0; k < n; ++k) {
                    double mkp = M[k * n + p]; double mkq = M[k * n + q];
                    M[k * n + p] = c * mkp - s * mkq;
                    M[k * n + q] = s * mkp + c * mkq;
                }
                for (int k = 0; k < n; ++k) {
                    double mpk = M[p * n + k]; double mqk = M[q * n + k];
                    M[p * n + k] = c * mpk - s * mqk;
                    M[q * n + k] = s * mpk + c * mqk;
                }
                M[p * n + q] = 0.0; M[q * n + p] = 0.0;

                for (int k = 0; k < n; ++k) {
                    double vkp = V[k * n + p]; double vkq = V[k * n + q];
                    V[k * n + p] = c * vkp - s * vkq;
                    V[k * n + q] = s * vkp + c * vkq;
                }
            }
        }
    }

    int min_idx = 0; double min_val = M[0];
    for (int i = 1; i < n; ++i) {
        double val = M[i * n + i];
        if (val < min_val) { min_val = val; min_idx = i; }
    }

    double norm = 0.0;
    for (int i = 0; i < n; ++i) { out_v[i] = (float)V[i * n + min_idx]; norm += out_v[i] * out_v[i]; }
    norm = sqrt(norm);
    if (norm > 1e-9) { for (int i = 0; i < n; ++i) out_v[i] /= (float)norm; }
    else { out_v[0] = 1.0f; for (int i = 1; i < n; ++i) out_v[i] = 0.0f; }
}

Vec3 triangulate(const Vec3& p1, const Mat3& R1, const Vec3& t1, const Vec3& p2, const Mat3& R2, const Vec3& t2) {
    float A[12];
    float b[4];

    A[0] = p1.x * R1.m[6] - R1.m[0]; A[1] = p1.x * R1.m[7] - R1.m[1]; A[2] = p1.x * R1.m[8] - R1.m[2]; b[0] = t1.x - p1.x * t1.z;
    A[3] = p1.y * R1.m[6] - R1.m[3]; A[4] = p1.y * R1.m[7] - R1.m[4]; A[5] = p1.y * R1.m[8] - R1.m[5]; b[1] = t1.y - p1.y * t1.z;
    A[6] = p2.x * R2.m[6] - R2.m[0]; A[7] = p2.x * R2.m[7] - R2.m[1]; A[8] = p2.x * R2.m[8] - R2.m[2]; b[2] = t2.x - p2.x * t2.z;
    A[9]  = p2.y * R2.m[6] - R2.m[3]; A[10] = p2.y * R2.m[7] - R2.m[4]; A[11] = p2.y * R2.m[8] - R2.m[5]; b[3]  = t2.y - p2.y * t2.z;

    double ATA[9] = {0}; double ATb[3] = {0};
    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            for (int k = 0; k < 4; ++k) ATA[i * 3 + j] += (double)A[k * 3 + i] * (double)A[k * 3 + j];
        }
        for (int k = 0; k < 4; ++k) ATb[i] += (double)A[k * 3 + i] * (double)b[k];
    }

    float ATA_f[9]; for(int i=0; i<9; ++i) ATA_f[i] = (float)ATA[i];
    float det = det3x3(ATA_f);
    if (fabs(det) < 1e-6f) return {0.0f, 0.0f, 0.0f};
    float inv_det = 1.0f / det;

    Vec3 X;
    X.x = inv_det * (ATb[0] * (ATA[4] * ATA[8] - ATA[5] * ATA[7]) + ATb[1] * (ATA[2] * ATA[7] - ATA[1] * ATA[8]) + ATb[2] * (ATA[1] * ATA[5] - ATA[2] * ATA[4]));
    X.y = inv_det * (ATb[0] * (ATA[5] * ATA[6] - ATA[3] * ATA[8]) + ATb[1] * (ATA[0] * ATA[8] - ATA[2] * ATA[6]) + ATb[2] * (ATA[2] * ATA[3] - ATA[0] * ATA[5]));
    X.z = inv_det * (ATb[0] * (ATA[3] * ATA[7] - ATA[4] * ATA[6]) + ATb[1] * (ATA[1] * ATA[6] - ATA[0] * ATA[7]) + ATb[2] * (ATA[0] * ATA[4] - ATA[1] * ATA[3]));

    return X;
}

void decompose_essential(const Mat3& E, Mat3& R1, Mat3& R2, Vec3& t1, Vec3& t2) {
    float U[9], S[3], V[9];
    svd3x3(E.m, U, S, V);

    float detU = det3x3(U);
    if (detU < 0.0f) { U[2] = -U[2]; U[5] = -U[5]; U[8] = -U[8]; }
    float detV = det3x3(V);
    if (detV < 0.0f) { V[2] = -V[2]; V[5] = -V[5]; V[8] = -V[8]; }

    t1 = {U[2], U[5], U[8]};
    t2 = {-t1.x, -t1.y, -t1.z};

    float W[9] = {0.0f, -1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f};
    float Wt[9] = {0.0f, 1.0f, 0.0f, -1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f};

    float UW[9], UWt[9];
    multiply3x3(U, W, UW);
    multiply3x3(U, Wt, UWt);

    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            R1.m[i * 3 + j] = UW[i * 3 + 0] * V[j * 3 + 0] + UW[i * 3 + 1] * V[j * 3 + 1] + UW[i * 3 + 2] * V[j * 3 + 2];
            R2.m[i * 3 + j] = UWt[i * 3 + 0] * V[j * 3 + 0] + UWt[i * 3 + 1] * V[j * 3 + 1] + UWt[i * 3 + 2] * V[j * 3 + 2];
        }
    }
}

void compute_fundamental_ransac(const std::vector<Point2D>& pts1_px, const std::vector<Point2D>& pts2_px, Mat3& F, std::vector<int>& inliers) {
    inliers.clear();
    for (int i = 0; i < 9; ++i) F.m[i] = 0.0f;

    int N = (int)pts1_px.size();
    if (N < 8) return;

    std::vector<Point2D> n1, n2;
    float T1[9], T2[9];
    normalize_points_2d(pts1_px, n1, T1);
    normalize_points_2d(pts2_px, n2, T2);

    int max_inliers = 0;
    for (int iter = 0; iter < 100; ++iter) {
        std::vector<int> sample(8);
        std::vector<int> indices(N);
        for (int i = 0; i < N; ++i) indices[i] = i;
        for (int i = 0; i < 8; ++i) {
            int j = i + (g_rng() % (N - i));
            std::swap(indices[i], indices[j]);
            sample[i] = indices[i];
        }

        float A[72] = {0};
        for (int i = 0; i < 8; ++i) {
            int idx = sample[i];
            float x1 = n1[idx].x, y1 = n1[idx].y;
            float x2 = n2[idx].x, y2 = n2[idx].y;
            A[i * 9 + 0] = x2 * x1; A[i * 9 + 1] = x2 * y1; A[i * 9 + 2] = x2;
            A[i * 9 + 3] = y2 * x1; A[i * 9 + 4] = y2 * y1; A[i * 9 + 5] = y2;
            A[i * 9 + 6] = x1; A[i * 9 + 7] = y1; A[i * 9 + 8] = 1.0f;
        }

        double ATA[81] = {0};
        for (int i = 0; i < 9; ++i) {
            for (int j = 0; j < 9; ++j) {
                for (int k = 0; k < 8; ++k) ATA[i * 9 + j] += (double)A[k * 9 + i] * (double)A[k * 9 + j];
            }
        }

        float ATA_f[81]; for(int i=0; i<81; ++i) ATA_f[i] = (float)ATA[i];
        float v[9];
        smallest_eigenvector_symmetric(ATA_f, 9, v);

        float F_temp[9];
        for (int i = 0; i < 9; ++i) F_temp[i] = v[i];

        float U[9], S[3], V_mat[9];
        svd3x3(F_temp, U, S, V_mat);

        float S_constrained[3] = {S[0], S[1], 0.0f};
        float F_norm[9] = {0};
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                F_norm[i * 3 + j] = U[i * 3 + 0] * S_constrained[0] * V_mat[j * 3 + 0] +
                                    U[i * 3 + 1] * S_constrained[1] * V_mat[j * 3 + 1] +
                                    U[i * 3 + 2] * S_constrained[2] * V_mat[j * 3 + 2];
            }
        }

        float T2T[9], temp[9], F_den[9];
        transpose3x3(T2, T2T);
        multiply3x3(T2T, F_norm, temp);
        multiply3x3(temp, T1, F_den);

        std::vector<int> current_inliers;
        for (int i = 0; i < N; ++i) {
            float x1 = pts1_px[i].x, y1 = pts1_px[i].y;
            float x2 = pts2_px[i].x, y2 = pts2_px[i].y;

            float l2_0 = F_den[0] * x1 + F_den[1] * y1 + F_den[2];
            float l2_1 = F_den[3] * x1 + F_den[4] * y1 + F_den[5];
            float l2_2 = F_den[6] * x1 + F_den[7] * y1 + F_den[8];
            float l1_0 = F_den[0] * x2 + F_den[3] * y2 + F_den[6];
            float l1_1 = F_den[1] * x2 + F_den[4] * y2 + F_den[7];

            float err = x2 * l2_0 + y2 * l2_1 + l2_2;
            float denom = l2_0 * l2_0 + l2_1 * l2_1 + l1_0 * l1_0 + l1_1 * l1_1;
            float sampson = (err * err) / (denom + 1e-9f);

            if (sampson < 4.0f) current_inliers.push_back(i);
        }

        if ((int)current_inliers.size() > max_inliers) {
            max_inliers = (int)current_inliers.size();
            for (int i = 0; i < 9; ++i) F.m[i] = F_den[i];
            inliers = current_inliers;
        }
    }

    if (max_inliers < 8) {
        for (int i = 0; i < 9; ++i) F.m[i] = 0.0f;
        inliers.clear();
    }
}

void compute_essential_ransac(const std::vector<Vec3>& pts1, const std::vector<Vec3>& pts2, Mat3& E, std::vector<int>& inliers) {
    inliers.clear();
    for (int i = 0; i < 9; ++i) E.m[i] = 0.0f;

    int N = (int)pts1.size();
    if (N < 8) return;

    std::vector<Point2D> pts1_2d, pts2_2d;
    for (int i = 0; i < N; ++i) {
        pts1_2d.push_back({pts1[i].x, pts1[i].y});
        pts2_2d.push_back({pts2[i].x, pts2[i].y});
    }

    std::vector<Point2D> n1, n2;
    float T1[9], T2[9];
    normalize_points_2d(pts1_2d, n1, T1);
    normalize_points_2d(pts2_2d, n2, T2);

    int max_inliers = 0;
    for (int iter = 0; iter < 100; ++iter) {
        std::vector<int> sample(8);
        std::vector<int> indices(N);
        for (int i = 0; i < N; ++i) indices[i] = i;
        for (int i = 0; i < 8; ++i) {
            int j = i + (g_rng() % (N - i));
            std::swap(indices[i], indices[j]);
            sample[i] = indices[i];
        }

        float A[72] = {0};
        for (int i = 0; i < 8; ++i) {
            int idx = sample[i];
            float x1 = n1[idx].x, y1 = n1[idx].y;
            float x2 = n2[idx].x, y2 = n2[idx].y;
            A[i * 9 + 0] = x2 * x1; A[i * 9 + 1] = x2 * y1; A[i * 9 + 2] = x2;
            A[i * 9 + 3] = y2 * x1; A[i * 9 + 4] = y2 * y1; A[i * 9 + 5] = y2;
            A[i * 9 + 6] = x1; A[i * 9 + 7] = y1; A[i * 9 + 8] = 1.0f;
        }

        double ATA[81] = {0};
        for (int i = 0; i < 9; ++i) {
            for (int j = 0; j < 9; ++j) {
                for (int k = 0; k < 8; ++k) ATA[i * 9 + j] += (double)A[k * 9 + i] * (double)A[k * 9 + j];
            }
        }

        float ATA_f[81]; for(int i=0; i<81; ++i) ATA_f[i] = (float)ATA[i];
        float v[9];
        smallest_eigenvector_symmetric(ATA_f, 9, v);

        float E_temp[9];
        for (int i = 0; i < 9; ++i) E_temp[i] = v[i];

        float U[9], S[3], V_mat[9];
        svd3x3(E_temp, U, S, V_mat);

        float S_constrained[3] = {(S[0] + S[1]) / 2.0f, (S[0] + S[1]) / 2.0f, 0.0f};
        float E_norm[9] = {0};
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j) {
                E_norm[i * 3 + j] = U[i * 3 + 0] * S_constrained[0] * V_mat[j * 3 + 0] +
                                    U[i * 3 + 1] * S_constrained[1] * V_mat[j * 3 + 1] +
                                    U[i * 3 + 2] * S_constrained[2] * V_mat[j * 3 + 2];
            }
        }

        float T2T[9], temp[9], E_den[9];
        transpose3x3(T2, T2T);
        multiply3x3(T2T, E_norm, temp);
        multiply3x3(temp, T1, E_den);

        std::vector<int> current_inliers;
        for (int i = 0; i < N; ++i) {
            float x1 = pts1[i].x, y1 = pts1[i].y;
            float x2 = pts2[i].x, y2 = pts2[i].y;

            float l2_0 = E_den[0] * x1 + E_den[1] * y1 + E_den[2];
            float l2_1 = E_den[3] * x1 + E_den[4] * y1 + E_den[5];
            float l2_2 = E_den[6] * x1 + E_den[7] * y1 + E_den[8];
            float l1_0 = E_den[0] * x2 + E_den[3] * y2 + E_den[6];
            float l1_1 = E_den[1] * x2 + E_den[4] * y2 + E_den[7];

            float err = x2 * l2_0 + y2 * l2_1 + l2_2;
            float denom = l2_0 * l2_0 + l2_1 * l2_1 + l1_0 * l1_0 + l1_1 * l1_1;
            float sampson = (err * err) / (denom + 1e-9f);

            float f_sq = g_fx * g_fy;
            if (f_sq < 1e-6f) f_sq = 250000.0f; 
            float sampson_px = sampson * f_sq;
            if (sampson_px < 9.0f) current_inliers.push_back(i); 
        }

        if ((int)current_inliers.size() > max_inliers) {
            max_inliers = (int)current_inliers.size();
            for (int i = 0; i < 9; ++i) E.m[i] = E_den[i];
            inliers = current_inliers;
        }
    }

    if (max_inliers < 8) {
        for (int i = 0; i < 9; ++i) E.m[i] = 0.0f;
        inliers.clear();
    }
}

#endif // SLAM_ALGORITHMS_GEOMETRY_CPP