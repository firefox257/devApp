// ./includes.js
export const INCLUDE_CACHE = {
    "stdlib.sl": `
const int32 HEAP_BASE = 65536;
const int32 HEAP_SIZE = 65536;

// Initialize the heap with a single large free chunk and a boundary marker
static void init_heap() {
    int32* base = (int32*)HEAP_BASE;
    base[0] = HEAP_SIZE; // size of chunk in bytes
    base[1] = 0;         // inuse flag (0 = free)
    
    // Boundary chunk prevents coalescing past the end of the heap
    int32* boundary = (int32*)(HEAP_BASE + HEAP_SIZE);
    boundary[0] = 0;     // size 0 marks end of heap
    boundary[1] = 1;     // inuse = 1 prevents backward coalescing into boundary
}

// Simplified dlmalloc-style allocation with splitting
export int32* malloc(int32 size) {
    if (size <= 0) return (int32*)0;
    
    // Align to 8 bytes, add 8 bytes for header (size, inuse)
    int32 aligned = (size + 7) & ~7;
    int32 needed = aligned + 8;
    
    int32 curr_addr = HEAP_BASE;
    while (1) {
        int32* curr = (int32*)curr_addr;
        int32 sz = curr[0];
        int32 inuse = curr[1];
        
        if (sz == 0) return (int32*)0; // Reached boundary
        
        if (inuse == 0 && sz >= needed) {
            int32 rem = sz - needed;
            if (rem >= 16) { // Minimum chunk size to prevent fragmentation
                int32* next = (int32*)(curr_addr + needed);
                next[0] = rem;
                next[1] = 0; // next chunk is free
                curr[0] = needed;
                curr[1] = 1; // current chunk is now in use
            } else {
                // Absorb remainder to avoid tiny fragments
                curr[0] = sz;
                curr[1] = 1;
            }
            return (int32*)(curr_addr + 8); // Return pointer to payload (after 8-byte header)
        }
        curr_addr = curr_addr + sz;
    }
}

// Free with forward and backward coalescing
export void free(int32* ptr) {
    if (ptr == (int32*)0) return;
    
    int32 ptr_addr = (int32)ptr;
    int32* chunk = (int32*)(ptr_addr - 8);
    int32 size = chunk[0];
    
    // Mark current chunk as free
    chunk[1] = 0;
    
    // 1. Coalesce with next chunk if it is free
    int32* next_chunk = (int32*)(ptr_addr - 8 + size);
    if (next_chunk[1] == 0 && next_chunk[0] > 0) {
        size = size + next_chunk[0];
        chunk[0] = size;
    }
    
    // 2. Coalesce with previous chunk if it is free
    int32 curr_addr = HEAP_BASE;
    int32 prev_addr = 0;
    while (curr_addr < ptr_addr - 8) {
        int32* curr = (int32*)curr_addr;
        if (curr[1] == 0) {
            prev_addr = curr_addr;
        }
        curr_addr = curr_addr + curr[0];
    }
    
    if (prev_addr != 0) {
        int32* prev_chunk = (int32*)prev_addr;
        if (prev_chunk[1] == 0) {
            prev_chunk[0] = prev_chunk[0] + size;
        }
    }
}
`
};