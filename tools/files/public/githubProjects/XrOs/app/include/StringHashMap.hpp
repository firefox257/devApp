#pragma once

#include <string>
#include <vector>
#include <cstddef>
#include <cstdint>
#include <utility>

// ---- typedef as requested ----
using HashKey = uint64_t;

template<typename T>
class StringHashMap {
private:
    // ---- Node structure ----
    struct Node {
        HashKey     hash;
        std::string key;
        T           value;
        Node*       next;

        Node(HashKey h, const std::string& k, const T& v, Node* n)
            : hash(h), key(k), value(v), next(n) {}

        Node(HashKey h, const std::string& k, T&& v, Node* n)
            : hash(h), key(k), value(std::move(v)), next(n) {}

        Node(HashKey h, std::string&& k, T&& v, Node* n)
            : hash(h), key(std::move(k)), value(std::move(v)), next(n) {}
    };

    // ---- Pool allocator: block-based, stable pointers ----
    class NodePool {
    private:
        static constexpr size_t BLOCK_SIZE = 1024;

        struct Block {
            alignas(Node) char data[sizeof(Node) * BLOCK_SIZE];
            size_t used = 0;
        };

        std::vector<Block*> blocks;
        Node* freeList = nullptr;

        Block* currentBlock() {
            Block* b = blocks.back();
            if (b->used >= BLOCK_SIZE) {
                b = new Block();
                blocks.push_back(b);
            }
            return b;
        }

        template<typename... Args>
        Node* alloc(Args&&... args) {
            Node* node;
            if (freeList) {
                node = freeList;
                freeList = freeList->next;
                new (node) Node(std::forward<Args>(args)...);
            } else {
                Block* b = currentBlock();
                node = reinterpret_cast<Node*>(b->data + b->used * sizeof(Node));
                b->used++;
                new (node) Node(std::forward<Args>(args)...);
            }
            return node;
        }

    public:
        NodePool()  { blocks.push_back(new Block()); }
        
        ~NodePool() {
            while (freeList) {
                Node* next = freeList->next;
                freeList->~Node();
                freeList = next;
            }
            for (Block* b : blocks) delete b;
        }

        // Proper move constructor to prevent double-free/leaks when moving the HashMap
        NodePool(NodePool&& other) noexcept 
            : blocks(std::move(other.blocks)), freeList(other.freeList) {
            other.freeList = nullptr;
        }

        NodePool& operator=(NodePool&& other) noexcept {
            if (this != &other) {
                // Note: Assumes the current pool is empty before assignment
                for (Block* b : blocks) delete b;
                blocks = std::move(other.blocks);
                freeList = other.freeList;
                other.freeList = nullptr;
            }
            return *this;
        }

        // Disable copying
        NodePool(const NodePool&) = delete;
        NodePool& operator=(const NodePool&) = delete;

        Node* make(HashKey h, const std::string& k, const T& v, Node* n) {
            return alloc(h, k, v, n);
        }
        Node* make(HashKey h, const std::string& k, T&& v, Node* n) {
            return alloc(h, k, std::move(v), n);
        }
        Node* make(HashKey h, std::string&& k, T&& v, Node* n) {
            return alloc(h, std::move(k), std::move(v), n);
        }

        void release(Node* node) {
            node->~Node();
            node->next = freeList;
            freeList = node;
        }
    };

    std::vector<Node*> buckets;
    NodePool           pool;
    size_t             count;
    float              maxLoadFactor;

    // ---- FNV-1a 64-bit ----
    static HashKey computeHash(const std::string& s) {
        HashKey h = 14695981039346656037ULL;
        for (unsigned char c : s) {
            h ^= static_cast<HashKey>(c);
            h *= 1099511628211ULL;
        }
        return h;
    }

    size_t bucketIdx(HashKey h) const {
        return static_cast<size_t>(h) & (buckets.size() - 1);
    }

    // ---- FIXED: Portable for both 32-bit and 64-bit size_t ----
    static size_t nextPow2(size_t n) {
        if (n <= 1) return 1;
        
        // Use uint64_t to safely handle shifts up to 32 without warnings, 
        // even if size_t is only 32 bits on the target platform (e.g., 32-bit ARM).
        uint64_t v = n - 1;
        v |= v >> 1;
        v |= v >> 2;
        v |= v >> 4;
        v |= v >> 8;
        v |= v >> 16;
        v |= v >> 32; 
        
        return static_cast<size_t>(v + 1);
    }

    void rehash() {
        size_t newSize = buckets.size() * 2;
        std::vector<Node*> nb(newSize, nullptr);

        for (Node* n : buckets) {
            while (n) {
                Node* next = n->next;
                size_t idx = static_cast<size_t>(n->hash) & (newSize - 1);
                n->next = nb[idx];
                nb[idx] = n;
                n = next;
            }
        }
        buckets = std::move(nb);
    }

    // Internal: find node by (hash + full key)
    Node* findFull(HashKey h, const std::string& key, size_t idx) const {
        for (Node* n = buckets[idx]; n; n = n->next) {
            if (n->hash == h && n->key == key) return n;
        }
        return nullptr;
    }

    // Internal: find node by hash only
    Node* findHashOnly(HashKey h, size_t idx) const {
        for (Node* n = buckets[idx]; n; n = n->next) {
            if (n->hash == h) return n;
        }
        return nullptr;
    }

    void maybeGrow() {
        if (static_cast<float>(count + 1) / buckets.size() > maxLoadFactor)
            rehash();
    }

public:
    explicit StringHashMap(size_t initCap = 16)
        : buckets(nextPow2(initCap), nullptr)
        , count(0)
        , maxLoadFactor(0.75f) {}

    ~StringHashMap() { clear(); }

    StringHashMap(const StringHashMap&)            = delete;
    StringHashMap& operator=(const StringHashMap&) = delete;

    StringHashMap(StringHashMap&& o) noexcept
        : buckets(std::move(o.buckets))
        , pool(std::move(o.pool))
        , count(o.count)
        , maxLoadFactor(o.maxLoadFactor)
    { o.count = 0; }

    // ============================================================
    //  operator[]  by  std::string
    // ============================================================
    T& operator[](const std::string& key) {
        HashKey h   = computeHash(key);
        size_t  idx = bucketIdx(h);

        if (Node* n = findFull(h, key, idx))
            return n->value;

        maybeGrow();
        idx = bucketIdx(h); // idx may have changed after rehash

        Node* n = pool.make(h, key, T{}, buckets[idx]);
        buckets[idx] = n;
        ++count;
        return n->value;
    }

    // ============================================================
    //  operator[]  by  HashKey
    // ============================================================
    T& operator[](HashKey h) {
        size_t idx = bucketIdx(h);

        if (Node* n = findHashOnly(h, idx))
            return n->value;

        maybeGrow();
        idx = bucketIdx(h);

        Node* n = pool.make(h, std::string{}, T{}, buckets[idx]);
        buckets[idx] = n;
        ++count;
        return n->value;
    }

    // ---- Lookup by string ----
    T* getByKey(const std::string& key) {
        HashKey h = computeHash(key);
        Node* n = findFull(h, key, bucketIdx(h));
        return n ? &n->value : nullptr;
    }

    const T* getByKey(const std::string& key) const {
        HashKey h = computeHash(key);
        Node* n = findFull(h, key, bucketIdx(h));
        return n ? &n->value : nullptr;
    }

    // ---- Lookup by precomputed hash (no string compare) ----
    T* getByHash(HashKey h) {
        Node* n = findHashOnly(h, bucketIdx(h));
        return n ? &n->value : nullptr;
    }

    const T* getByHash(HashKey h) const {
        Node* n = findHashOnly(h, bucketIdx(h));
        return n ? &n->value : nullptr;
    }

    // ---- Lookup by hash + key (collision-safe, skip recompute) ----
    T* getByHash(HashKey h, const std::string& key) {
        Node* n = findFull(h, key, bucketIdx(h));
        return n ? &n->value : nullptr;
    }

    // ---- Compute hash for a key ----
    HashKey getHash(const std::string& key) const {
        return computeHash(key);
    }

    // ---- Query ----
    bool contains(const std::string& key) const {
        HashKey h = computeHash(key);
        return findFull(h, key, bucketIdx(h)) != nullptr;
    }

    bool containsHash(HashKey h) const {
        return findHashOnly(h, bucketIdx(h)) != nullptr;
    }

    // ---- Remove ----
    bool remove(const std::string& key) {
        HashKey h   = computeHash(key);
        size_t  idx = bucketIdx(h);

        Node* prev = nullptr;
        for (Node* n = buckets[idx]; n; n = n->next) {
            if (n->hash == h && n->key == key) {
                if (prev) prev->next = n->next;
                else      buckets[idx] = n->next;
                pool.release(n);
                --count;
                return true;
            }
            prev = n;
        }
        return false;
    }

    bool removeHash(HashKey h) {
        size_t idx = bucketIdx(h);

        Node* prev = nullptr;
        for (Node* n = buckets[idx]; n; n = n->next) {
            if (n->hash == h) {
                if (prev) prev->next = n->next;
                else      buckets[idx] = n->next;
                pool.release(n);
                --count;
                return true;
            }
            prev = n;
        }
        return false;
    }

    size_t size()  const { return count; }
    bool   empty() const { return count == 0; }

    void clear() {
        for (Node*& head : buckets) {
            while (head) {
                Node* next = head->next;
                pool.release(head);
                head = next;
            }
        }
        count = 0;
    }
};