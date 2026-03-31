/**
 * Default Theme Script
 * Minimal initialization - no animations
 * 
 * ✅ Compatible with ThemeManager cleanup system
 */
(function() {
  'use strict';
  
  // Optional: Log theme load for debugging
  console.log('✓ Default theme loaded');
  
  // ✅ Track any resources this theme creates (optional for default theme)
  const themeResources = {
    intervals: [],
    timeouts: [],
    animations: []
  };
  
  // Example: If you add an interval later, track it like this:
  // const id = setInterval(() => { ... }, 1000);
  // themeResources.intervals.push(id);
  // ThemeManager.trackInterval(id);
  
  // ✅ Expose cleanup function via window.ThemeCleanup (REQUIRED)
  // This is called by ThemeManager when switching themes
  window.ThemeCleanup = function cleanup() {
    console.log('✓ Default theme cleanup started');
    
    // Clear any tracked intervals
    themeResources.intervals.forEach(id => {
      try { clearInterval(id); } catch(e) {}
    });
    
    // Clear any tracked timeouts
    themeResources.timeouts.forEach(id => {
      try { clearTimeout(id); } catch(e) {}
    });
    
    // Cancel any tracked animation frames
    themeResources.animations.forEach(id => {
      try { cancelAnimationFrame(id); } catch(e) {}
    });
    
    // Reset canvas if it was used
    const canvas = document.getElementById('themeCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.resetTransform();
      }
    }
    
    // Clean up any event listeners you added
    // Example: document.removeEventListener('resize', yourHandler);
    
    console.log('✓ Default theme unloaded');
  };
  
  // ✅ Optional: Also register via registry for multiple cleanup functions
  // (Useful if your theme has multiple modules that need cleanup)
  if (typeof ThemeManager !== 'undefined' && ThemeManager.registerCleanup) {
    ThemeManager.registerCleanup(() => {
      console.log('✓ Default theme registry cleanup');
      // Additional cleanup logic here if needed
    });
  }
  
})();