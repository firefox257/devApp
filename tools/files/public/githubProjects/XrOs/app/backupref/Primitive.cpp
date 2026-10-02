#include <iostream>
#include <type_traits>
#include <string>
#include <cstdlib> // For std::terminate (optional)

template <typename T>
class Primitive {
public:
    enum class State { Undefined, Null, Defined };

private:
    State m_state;
    T m_value;

public:
    // 1. Constructors
    constexpr Primitive() : m_state(State::Undefined), m_value{} {}
    constexpr Primitive(std::nullptr_t) : m_state(State::Null), m_value{} {}
    constexpr Primitive(const T& val) : m_state(State::Defined), m_value(val) {}
    constexpr Primitive(T&& val) : m_state(State::Defined), m_value(std::move(val)) {}

    // 2. State Checkers
    constexpr bool is_undefined() const { return m_state == State::Undefined; }
    constexpr bool is_null() const      { return m_state == State::Null; }
    constexpr bool has_value() const    { return m_state == State::Defined; }

    // 3. Value Access (NO EXCEPTIONS)
    constexpr const T& value() const {
        if (!has_value()) std::terminate(); 
        return m_value;
    }

    constexpr T& value() {
        if (!has_value()) std::terminate();
        return m_value;
    }

    // 4. Implicit conversion (Acts like a primitive)
    constexpr operator T() const { 
        return m_value; 
    }

    // 5. Utility methods
    constexpr void reset() { m_state = State::Undefined; m_value = T{}; }
    constexpr void clear() { m_state = State::Null; m_value = T{}; }

    // ==========================================
    // NEW: Increment and Decrement Operators
    // ==========================================
    
    // Prefix increment (++i)
    constexpr Primitive& operator++() {
        if (has_value()) ++m_value;
        return *this;
    }

    // Postfix increment (i++)
    constexpr Primitive operator++(int) {
        Primitive temp = *this;
        if (has_value()) ++m_value;
        return temp;
    }

    // Prefix decrement (--i)
    constexpr Primitive& operator--() {
        if (has_value()) --m_value;
        return *this;
    }

    // Postfix decrement (i--)
    constexpr Primitive operator--(int) {
        Primitive temp = *this;
        if (has_value()) --m_value;
        return temp;
    }
};

// ==========================================
// Operator Overloads
// ==========================================

#define DEFINE_BINARY_OP(OP) \
template <typename T, typename U> \
constexpr auto operator OP(const Primitive<T>& lhs, const Primitive<U>& rhs) { \
    using Common = std::common_type_t<T, U>; \
    if (!lhs.has_value() || !rhs.has_value()) return Primitive<Common>(); \
    return Primitive<Common>(static_cast<Common>(lhs.value()) OP static_cast<Common>(rhs.value())); \
} \
template <typename T, typename U> \
constexpr auto operator OP(const Primitive<T>& lhs, const U& rhs) { \
    using Common = std::common_type_t<T, U>; \
    if (!lhs.has_value()) return Primitive<Common>(); \
    return Primitive<Common>(static_cast<Common>(lhs.value()) OP static_cast<Common>(rhs)); \
} \
template <typename T, typename U> \
constexpr auto operator OP(const T& lhs, const Primitive<U>& rhs) { \
    using Common = std::common_type_t<T, U>; \
    if (!rhs.has_value()) return Primitive<Common>(); \
    return Primitive<Common>(static_cast<Common>(lhs) OP static_cast<Common>(rhs.value())); \
}

DEFINE_BINARY_OP(+)
DEFINE_BINARY_OP(-)
DEFINE_BINARY_OP(*)
DEFINE_BINARY_OP(/)
DEFINE_BINARY_OP(==)
DEFINE_BINARY_OP(!=)
DEFINE_BINARY_OP(<)
DEFINE_BINARY_OP(<=)
DEFINE_BINARY_OP(>)
DEFINE_BINARY_OP(>=)

#undef DEFINE_BINARY_OP

// Stream output operator
template <typename T>
std::ostream& operator<<(std::ostream& os, const Primitive<T>& p) {
    if (p.is_undefined()) os << "undefined";
    else if (p.is_null()) os << "null";
    else os << p.value();
    return os;
}

// ==========================================
// Demo / Main
// ==========================================
int main() {
    Primitive<int> a;             // Undefined
    Primitive<int> b = nullptr;   // Null
    Primitive<int> c = 10;        // Defined

    std::cout << "a: " << a << "\n";
    std::cout << "b: " << b << "\n";
    std::cout << "c: " << c << "\n\n";

    std::cout << "10 + undefined = " << (c + a) << "\n";
    std::cout << "null + 5 = " << (b + 5) << "\n\n";

    int raw_a = a; 
    std::cout << "Implicitly converted 'undefined' to int: " << raw_a << "\n\n";

    // --- YOUR FOR LOOP ---
    // This now works perfectly! 
    // 1. `i = 0` uses the value constructor.
    // 2. `i < 10` returns a Primitive<bool>, which implicitly converts to `bool` for the loop condition.
    // 3. `i++` uses our new postfix increment operator.
    std::cout << "--- For Loop Test ---\n";
    for(Primitive<int> i = 0; i < 10; i++) {
        std::cout << "i: " << i << "\r\n";
    }
    
    return 0;
}