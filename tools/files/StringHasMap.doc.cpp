/**
 * ============================================================================
 *  StringHashMap<T> - Usage Documentation & Feature Guide
 * ============================================================================
 * 
 * OVERVIEW:
 * A high-performance, pointer-stable hash map for std::string keys.
 * 
 * KEY FEATURES:
 * 1. Pointer/Reference Stability: Values never move in memory. References and 
 *    pointers to values remain valid even after the map resizes (rehashes).
 * 2. Dual-Mode Lookups: Supports both standard string lookups and ultra-fast 
 *    pre-computed HashKey lookups.
 * 3. Auto-Insertion: operator[] automatically creates default-constructed 
 *    entries if the key/hash does not exist.
 * 
 * TYPEDEF:
 * using HashKey = uint64_t;
 * 
 * ============================================================================
 */

#include "StringHashMap.h"
#include <iostream>
#include <string>

// Example payload type
struct PlayerData {
    float health = 100.0f;
    int score = 0;
};

int main() {
    
    // ========================================================================
    // 1. INITIALIZATION
    // ========================================================================
    
    // Create a map. You can optionally specify an initial bucket capacity.
    // Default is 16. It automatically resizes when the load factor exceeds 0.75.
    StringHashMap<PlayerData> playerMap(32);


    // ========================================================================
    // 2. BASIC INSERTION & ACCESS (String-based)
    // ========================================================================
    
    // operator[] with a string automatically inserts a default-constructed 
    // PlayerData if the key doesn't exist, then returns a reference to it.
    playerMap["Player1"].health = 85.5f;
    playerMap["Player1"].score = 1500;
    
    // Subsequent calls just return the existing reference.
    playerMap["Player1"].score += 500;


    // ========================================================================
    // 3. HASH-BASED OPERATIONS (High Performance)
    // ========================================================================
    
    // If you are doing repeated lookups in a hot loop, compute the hash once.
    HashKey p1Hash = playerMap.getHash("Player1");
    
    // operator[] also accepts a HashKey. 
    // WARNING: This bypasses string comparison. It assumes the 64-bit hash 
    // is unique. If you insert via HashKey without a string, the map stores 
    // an empty string for the key to save memory.
    playerMap[p1Hash].health = 100.0f; // Updates Player1's health
    
    // Inserting a brand new entry using ONLY a hash (no string key stored)
    HashKey customHash = 0xDEADBEEFCAFE1234ULL;
    playerMap[customHash].score = 9999; 


    // ========================================================================
    // 4. SAFE LOOKUPS (Pointer Returns)
    // ========================================================================
    
    // Use getByKey() when you don't want to accidentally create an entry.
    // Returns a pointer to the value, or nullptr if not found.
    PlayerData* pData = playerMap.getByKey("Player2");
    if (pData) {
        std::cout << "Found Player2!\n";
    } else {
        std::cout << "Player2 does not exist.\n";
    }

    // Use getByHash() for ultra-fast lookups using a pre-computed hash.
    // This skips the string hash computation AND the string comparison.
    PlayerData* p1Data = playerMap.getByHash(p1Hash);
    if (p1Data) {
        std::cout << "Player1 Health: " << p1Data->health << "\n";
    }

    // Hybrid lookup: If you have the hash but want collision safety 
    // (checks hash first, then verifies the string).
    PlayerData* safeP1 = playerMap.getByHash(p1Hash, "Player1");


    // ========================================================================
    // 5. EXISTENCE CHECKS
    // ========================================================================
    
    // Check by string (computes hash, compares string)
    bool hasP1 = playerMap.contains("Player1");       // true
    bool hasP2 = playerMap.contains("Player2");       // false

    // Check by hash only (O(1) integer comparison, no string overhead)
    bool hasHash = playerMap.containsHash(p1Hash);    // true


    // ========================================================================
    // 6. DELETION / REMOVAL
    // ========================================================================
    
    // Remove by string. Returns true if found and removed, false otherwise.
    bool removed = playerMap.remove("Player1");       // true
    
    // Remove by hash only.
    bool removedHash = playerMap.removeHash(customHash); // true

    // Note: Removing an element returns its memory to the internal pool 
    // for future allocations, but does NOT invalidate pointers to OTHER 
    // elements in the map.


    // ========================================================================
    // 7. POINTER / REFERENCE STABILITY GUARANTEE
    // ========================================================================
    
    // One of the main features of this map is that values NEVER move in memory.
    // Standard std::unordered_map invalidates references/pointers on rehash.
    // This StringHashMap guarantees they stay valid.
    
    playerMap.clear(); // Start fresh
    
    // Get a reference to an element
    PlayerData& stableRef = playerMap["StableEntity"];
    stableRef.health = 50.0f;
    
    // Get a raw pointer to the same element
    PlayerData* stablePtr = playerMap.getByKey("StableEntity");

    // Force a massive rehash by inserting many elements
    for (int i = 0; i < 10000; ++i) {
        playerMap["FillerEntity_" + std::to_string(i)].score = i;
    }

    // EVEN AFTER REHASHING, the reference and pointer are 100% valid!
    std::cout << "Health after rehash: " << stableRef.health << "\n";   // 50.0
    std::cout << "Ptr health after rehash: " << stablePtr->health << "\n"; // 50.0
    
    stableRef.health = 75.0f; // Safe to modify!


    // ========================================================================
    // 8. UTILITY METHODS
    // ========================================================================
    
    size_t count = playerMap.size();   // Number of elements in the map
    bool isEmpty = playerMap.empty();  // True if size() == 0
    
    // Removes all elements. Pointers to elements become invalid after this.
    playerMap.clear(); 

    return 0;
}