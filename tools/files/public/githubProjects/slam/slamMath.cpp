// ./slamMath.cpp
#ifndef SLAM_MATH_CPP
#define SLAM_MATH_CPP

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <vector>
#include <algorithm>
#include <random>

struct Vec3 { float x, y, z; };
struct Mat3 { float m[9]; };
struct Point2D { float x, y; };

Vec3 cross(Vec3 a, Vec3 b) {
    return {
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    };
}

float dot(Vec3 a, Vec3 b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

Vec3 normalize(Vec3 v) {
    float len = sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 1e-8f) return {0.0f, 0.0f, 0.0f};
    return {v.x / len, v.y / len, v.z / len};
}

float det3x3(const float M[9]) {
    return
        M[0] * (M[4] * M[8] - M[5] * M[7]) -
        M[1] * (M[3] * M[8] - M[5] * M[6]) +
        M[2] * (M[3] * M[7] - M[4] * M[6]);
}

static Vec3 perp_unit(Vec3 v) {
    Vec3 a = (fabs(v.x) < 0.9f) ? Vec3{1.0f, 0.0f, 0.0f}
                                : Vec3{0.0f, 1.0f, 0.0f};

    float d = dot(a, v);
    Vec3 p = {
        a.x - v.x * d,
        a.y - v.y * d,
        a.z - v.z * d
    };

    return normalize(p);
}

// INDUSTRY STANDARD: SVD using double-precision accumulation to prevent condition number 
// squaring artifacts inherent in float32 A^T A Jacobi eigenvalue solvers.
void svd3x3(const float A[9], float U[9], float S[3], float V[9]) {
    for (int i = 0; i < 9; ++i) {
        if (std::isnan(A[i]) || std::isinf(A[i])) {
            memset(U, 0, 9 * sizeof(float));
            memset(S, 0, 3 * sizeof(float));
            memset(V, 0, 9 * sizeof(float));
            U[0] = 1.0f; U[4] = 1.0f; U[8] = 1.0f;
            V[0] = 1.0f; V[4] = 1.0f; V[8] = 1.0f;
            return;
        }
    }

    double ATA[9] = {0};
    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 3; ++j) {
            for (int k = 0; k < 3; ++k) {
                ATA[i * 3 + j] += (double)A[k * 3 + i] * (double)A[k * 3 + j];
            }
        }
    }

    double D[9];
    memcpy(D, ATA, sizeof(D));

    double Vmat[9] = {
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
    };

    for (int sweep = 0; sweep < 50; ++sweep) {
        double off = 0.0;
        for (int p = 0; p < 3; ++p) {
            for (int q = p + 1; q < 3; ++q) {
                off += fabs(D[p * 3 + q]);
            }
        }

        if (off < 1e-15) break;

        for (int p = 0; p < 2; ++p) {
            for (int q = p + 1; q < 3; ++q) {
                double apq = D[p * 3 + q];
                if (fabs(apq) < 1e-15) continue;

                double app = D[p * 3 + p];
                double aqq = D[q * 3 + q];

                double theta = (aqq - app) / (2.0 * apq);
                double t = (theta >= 0.0 ? 1.0 : -1.0) /
                          (fabs(theta) + sqrt(theta * theta + 1.0));

                double c = 1.0 / sqrt(t * t + 1.0);
                double s = t * c;

                for (int k = 0; k < 3; ++k) {
                    double dkp = D[k * 3 + p];
                    double dkq = D[k * 3 + q];

                    D[k * 3 + p] = c * dkp - s * dkq;
                    D[k * 3 + q] = s * dkp + c * dkq;
                }

                for (int k = 0; k < 3; ++k) {
                    double dpk = D[p * 3 + k];
                    double dqk = D[q * 3 + k];

                    D[p * 3 + k] = c * dpk - s * dqk;
                    D[q * 3 + k] = s * dpk + c * dqk;
                }

                D[p * 3 + q] = 0.0;
                D[q * 3 + p] = 0.0;

                for (int k = 0; k < 3; ++k) {
                    double vkp = Vmat[k * 3 + p];
                    double vkq = Vmat[k * 3 + q];

                    Vmat[k * 3 + p] = c * vkp - s * vkq;
                    Vmat[k * 3 + q] = s * vkp + c * vkq;
                }
            }
        }
    }

    double eig[3] = {D[0], D[4], D[8]};
    int idx[3] = {0, 1, 2};

    if (eig[1] > eig[0]) {
        std::swap(eig[0], eig[1]);
        std::swap(idx[0], idx[1]);
    }

    if (eig[2] > eig[1]) {
        std::swap(eig[1], eig[2]);
        std::swap(idx[1], idx[2]);
    }

    if (eig[1] > eig[0]) {
        std::swap(eig[0], eig[1]);
        std::swap(idx[0], idx[1]);
    }

    for (int j = 0; j < 3; ++j) {
        S[j] = (float)sqrt(eig[j] > 0.0 ? eig[j] : 0.0);
    }

    for (int j = 0; j < 3; ++j) {
        int old_j = idx[j];

        V[0 * 3 + j] = (float)Vmat[0 * 3 + old_j];
        V[1 * 3 + j] = (float)Vmat[1 * 3 + old_j];
        V[2 * 3 + j] = (float)Vmat[2 * 3 + old_j];
    }

    for (int j = 0; j < 3; ++j) {
        if (S[j] > 1e-6f) {
            float x =
                A[0 * 3 + 0] * V[0 * 3 + j] +
                A[0 * 3 + 1] * V[1 * 3 + j] +
                A[0 * 3 + 2] * V[2 * 3 + j];

            float y =
                A[1 * 3 + 0] * V[0 * 3 + j] +
                A[1 * 3 + 1] * V[1 * 3 + j] +
                A[1 * 3 + 2] * V[2 * 3 + j];

            float z =
                A[2 * 3 + 0] * V[0 * 3 + j] +
                A[2 * 3 + 1] * V[1 * 3 + j] +
                A[2 * 3 + 2] * V[2 * 3 + j];

            U[0 * 3 + j] = x / S[j];
            U[1 * 3 + j] = y / S[j];
            U[2 * 3 + j] = z / S[j];
        } else {
            U[0 * 3 + j] = 0.0f;
            U[1 * 3 + j] = 0.0f;
            U[2 * 3 + j] = 0.0f;
        }
    }

    Vec3 c0 = {U[0], U[3], U[6]};
    Vec3 c1 = {U[1], U[4], U[7]};
    Vec3 c2 = {U[2], U[5], U[8]};

    float n0 = sqrt(dot(c0, c0));
    if (n0 < 1e-6f) {
        c0 = {1.0f, 0.0f, 0.0f};
    } else {
        c0.x /= n0;
        c0.y /= n0;
        c0.z /= n0;
    }

    float d01 = dot(c1, c0);
    c1.x -= d01 * c0.x;
    c1.y -= d01 * c0.y;
    c1.z -= d01 * c0.z;

    float n1 = sqrt(dot(c1, c1));
    if (n1 < 1e-6f) {
        c1 = perp_unit(c0);
    } else {
        c1.x /= n1;
        c1.y /= n1;
        c1.z /= n1;
    }

    float n2 = sqrt(dot(c2, c2));
    if (n2 < 1e-6f) {
        c2 = cross(c0, c1);
    } else {
        float d20 = dot(c2, c0);
        float d21 = dot(c2, c1);

        c2.x -= d20 * c0.x + d21 * c1.x;
        c2.y -= d20 * c0.y + d21 * c1.y;
        c2.z -= d20 * c0.z + d21 * c1.z;

        float n2b = sqrt(dot(c2, c2));
        if (n2b < 1e-6f) {
            c2 = cross(c0, c1);
        }
    }

    c2 = normalize(c2);

    U[0] = c0.x; U[3] = c0.y; U[6] = c0.z;
    U[1] = c1.x; U[4] = c1.y; U[7] = c1.z;
    U[2] = c2.x; U[5] = c2.y; U[8] = c2.z;

    float detU = det3x3(U);
    if (detU < 0.0f) {
        U[2] = -U[2];
        U[5] = -U[5];
        U[8] = -U[8];
    }
}

float cross_product_2d(Point2D O, Point2D A, Point2D B) {
    return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

std::vector<Point2D> compute_convex_hull(std::vector<Point2D> P) {
    int n = (int)P.size(), k = 0;
    if (n <= 2) return P;

    std::vector<Point2D> H(2 * n);

    std::sort(P.begin(), P.end(), [](const Point2D& a, const Point2D& b) {
        return a.x < b.x || (a.x == b.x && a.y < b.y);
    });

    for (int i = 0; i < n; ++i) {
        while (k >= 2 && cross_product_2d(H[k - 2], H[k - 1], P[i]) <= 0.0f) k--;
        H[k++] = P[i];
    }

    for (int i = n - 2, t = k + 1; i >= 0; i--) {
        while (k >= t && cross_product_2d(H[k - 2], H[k - 1], P[i]) <= 0.0f) k--;
        H[k++] = P[i];
    }

    H.resize(k > 0 ? k - 1 : 0);
    return H;
}

std::vector<Point2D> compute_concave_hull(const std::vector<Point2D>& P, float alpha) {
    if (P.size() <= 3) return compute_convex_hull(P);
    
    std::vector<Point2D> unique_P = P;
    std::sort(unique_P.begin(), unique_P.end(), [](const Point2D& a, const Point2D& b) {
        if (fabs(a.x - b.x) > 1e-5f) return a.x < b.x;
        return a.y < b.y;
    });
    unique_P.erase(std::unique(unique_P.begin(), unique_P.end(), [](const Point2D& a, const Point2D& b) {
        return fabs(a.x - b.x) < 1e-5f && fabs(a.y - b.y) < 1e-5f;
    }), unique_P.end());

    if (unique_P.size() <= 3) return compute_convex_hull(unique_P);
    
    std::vector<Point2D> hull = compute_convex_hull(unique_P);
    if (hull.size() <= 3) return hull;

    auto point_in_strict_triangle = [](Point2D p, Point2D a, Point2D b, Point2D c) {
        float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
        float d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
        float d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
        
        bool has_neg = (d1 < -1e-5f) || (d2 < -1e-5f) || (d3 < -1e-5f);
        bool has_pos = (d1 > 1e-5f) || (d2 > 1e-5f) || (d3 > 1e-5f);
        bool on_boundary = (fabs(d1) <= 1e-5f) || (fabs(d2) <= 1e-5f) || (fabs(d3) <= 1e-5f);
        
        return !(has_neg && has_pos) && !on_boundary;
    };

    bool changed = true;
    int max_iter = 100;
    
    while (changed && max_iter-- > 0) {
        changed = false;
        std::vector<Point2D> new_hull;
        
        for (size_t i = 0; i < hull.size(); ++i) {
            Point2D p1 = hull[i];
            Point2D p2 = hull[(i + 1) % hull.size()];
            
            float dx = p2.x - p1.x;
            float dy = p2.y - p1.y;
            float dist = sqrt(dx * dx + dy * dy);
            
            if (dist > alpha) {
                float best_score = -1e9f;
                Point2D best_p = p1;
                bool found = false;
                
                for (const auto& pt : unique_P) {
                    if (fabs(pt.x - p1.x) < 1e-5f && fabs(pt.y - p1.y) < 1e-5f) continue;
                    if (fabs(pt.x - p2.x) < 1e-5f && fabs(pt.y - p2.y) < 1e-5f) continue;
                    
                    float dot1 = (pt.x - p1.x) * dx + (pt.y - p1.y) * dy;
                    if (dot1 < 0.0f || dot1 > dist * dist) continue;
                    
                    float cross_val = dx * (pt.y - p1.y) - dy * (pt.x - p1.x);
                    if (cross_val <= 1e-5f) continue; 
                    
                    float d1 = sqrt((pt.x - p1.x) * (pt.x - p1.x) + (pt.y - p1.y) * (pt.y - p1.y));
                    float d2 = sqrt((pt.x - p2.x) * (pt.x - p2.x) + (pt.y - p2.y) * (pt.y - p2.y));
                    
                    if (d1 > alpha * 1.5f || d2 > alpha * 1.5f) continue;
                    
                    bool empty = true;
                    for (const auto& other : unique_P) {
                        if (fabs(other.x - p1.x) < 1e-5f && fabs(other.y - p1.y) < 1e-5f) continue;
                        if (fabs(other.x - p2.x) < 1e-5f && fabs(other.y - p2.y) < 1e-5f) continue;
                        if (fabs(other.x - pt.x) < 1e-5f && fabs(other.y - pt.y) < 1e-5f) continue;
                        
                        if (point_in_strict_triangle(other, p1, pt, p2)) {
                            empty = false;
                            break;
                        }
                    }
                    if (!empty) continue;
                    
                    float mid_x = (p1.x + p2.x) / 2.0f;
                    float mid_y = (p1.y + p2.y) / 2.0f;
                    float d_mid = sqrt((pt.x - mid_x) * (pt.x - mid_x) + (pt.y - mid_y) * (pt.y - mid_y));
                    float score = cross_val - d_mid; 
                    
                    if (score > best_score) {
                        best_score = score;
                        best_p = pt;
                        found = true;
                    }
                }
                
                if (found) {
                    new_hull.push_back(p1);
                    new_hull.push_back(best_p);
                    changed = true;
                } else {
                    new_hull.push_back(p1);
                }
            } else {
                new_hull.push_back(p1);
            }
        }
        
        std::vector<Point2D> cleaned_hull;
        for (size_t i = 0; i < new_hull.size(); ++i) {
            if (i == 0 || fabs(new_hull[i].x - new_hull[i-1].x) > 1e-5f || fabs(new_hull[i].y - new_hull[i-1].y) > 1e-5f) {
                cleaned_hull.push_back(new_hull[i]);
            }
        }
        
        if (cleaned_hull.size() > 1 && 
            fabs(cleaned_hull.front().x - cleaned_hull.back().x) < 1e-5f && 
            fabs(cleaned_hull.front().y - cleaned_hull.back().y) < 1e-5f) {
            cleaned_hull.pop_back();
        }
        
        if (cleaned_hull.size() >= 3) {
            hull = cleaned_hull;
        } else {
            break;
        }
    }
    return hull;
}

#endif // SLAM_MATH_CPP