#include <cstdint>
#include <type_traits>
#include <iostream>
#include <cstring>

// ==========================================
// MODULE 1 SIMULATION
// ==========================================
namespace mod1 {

	class base;
	class derived;

	enum class Base_ClassTypeID : uint32_t {
		Base,
		Derived,
		Count
	};

	struct Base_VTable {
		void (*func)(base* self);
		void (*func2)(base* self);
	};

	void base_func(base* self);
	void base_func2(base* self);
	void derived_func(base* self);
	void derived_func2(base* self);

	// C++17 COMPLIANT: Positional initialization matches enum order (0, 1)
	const Base_VTable Base_VTables[static_cast<int>(Base_ClassTypeID::Count)] = {
		{ base_func, base_func2 },      // Index 0: Base_ClassTypeID::Base
		{ derived_func, derived_func2 } // Index 1: Base_ClassTypeID::Derived
	};

	// FIXED: Removed stray 'list' and ensured no blank lines break the '\' continuation
	#define base_vfriend \
	friend void base_func(base* self); \
	friend void base_func2(base* self); \
	
	friend void derived_func(base* self); \
	friend void derived_func2(base* self);

	class base {
		protected:
		Base_ClassTypeID _vtype_id;
		base_vfriend
		int x = 0;

		public:
		base() {
			_vtype_id = Base_ClassTypeID::Base;
		}

		inline void func() {
			Base_VTables[(int)_vtype_id].func(this);
		}
		inline void func2() {
			Base_VTables[(int)_vtype_id].func2(this);
		}

		void print() const { std::cout << "x = " << x << "\n"; }
	};

	void base_func(base* self) {
		self->x = 111;
	}
	void base_func2(base* self) {
		self->x = 222;
	}

	class derived : public base {
		protected:
		base_vfriend
		public:
		derived() {
			_vtype_id = Base_ClassTypeID::Derived;
		}
	};

	void derived_func(base* self) {
		derived* at = static_cast<derived*>(self);
		at->x = 123;
	}
	void derived_func2(base* self) {
		self->x = 456;
	}

	// These will now pass successfully!
	static_assert(std::is_standard_layout_v<base>, "Unsafe for Wasm memcpy.");
	static_assert(std::is_trivially_copyable_v<base>, "Unsafe for Wasm memcpy.");

} // namespace mod1


// ==========================================
// MAIN EXECUTION & TESTS
// ==========================================
int main() {
	std::cout << "--- Test 1: Pointer Polymorphism (Module 1) ---\n";
	{
		mod1::base* ptr1 = new mod1::base();
		ptr1->func();
		ptr1->print(); // Expected: 111

		mod1::base* ptr2 = new mod1::derived();
		ptr2->func();
		ptr2->print();  // Expected: 123
		ptr2->func2();
		ptr2->print();  // Expected: 456

		delete ptr1;
		delete ptr2;
	}

	return 0;
}