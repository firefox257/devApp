/**
 * Default Theme Script - v2.7+ Compliant
 * Minimal initialization - no animations
 * 
 * ✅ Compatible with ThemeManager cleanup system
 * ✅ Universal browser compatibility
 * ✅ Early-return pattern for missing canvas
 */
(function() {
  'use strict';
  
  // Optional: Log theme load for debugging
  console.log('✓ Default theme loaded');
  
  // Get canvas reference (used in cleanup)
  const canvas = document.getElementById('themeCanvas');
  
  // Early return if canvas doesn't exist (defensive programming)
  if (!canvas) {
    window.ThemeCleanup = function() {};
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  // ✅ Expose cleanup function via window.ThemeCleanup (REQUIRED)
  // This is called by ThemeManager when switching themes
  window.ThemeCleanup = function cleanup() {
    console.log('✓ Default theme cleanup started');
    
    // Reset canvas transform and clear content (universal compatibility)
    if (ctx) {
      try {
        // Use setTransform instead of resetTransform for broader support
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch(e) {
        console.warn('Default theme: canvas cleanup failed', e);
      }
    }
    
    // Clean up any event listeners you might have added
    // Example: document.removeEventListener('resize', yourHandler);
    
    console.log('✓ Default theme unloaded');
  };
  
  // ✅ Optional: Register via ThemeManager registry for layered cleanup
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('✓ Default theme registry cleanup');
      // Additional cleanup logic here if needed in future
    });
  }
  
})();