/**
 * OS Theme Bridge for Iframe Apps
 * Material Icons OS v2.7+
 * 
 * Usage: Include in iframe app <head>:
 * <script src="/os-theme-bridge.js"></script>
 */
(function() {
  'use strict';

  // Only run inside iframes marked as OS apps
  if (!window.frameElement || !window.frameElement.hasAttribute('data-os-app')) {
    return;
  }

  const Bridge = {
    appId: window.frameElement.dataset.appId || `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentOrigin: '*', // Updated after first successful message
    isReady: false,
    
    /**
     * Request current theme from parent OS
     */
    requestTheme() {
      try {
        window.parent.postMessage(
          { type: 'themeRequest', appId: this.appId, timestamp: Date.now() },
          this.parentOrigin
        );
      } catch (e) {
        console.warn('⚠ Bridge: Failed to request theme', e);
      }
    },

    /**
     * Apply theme variables to iframe document
     */
    applyTheme(themeData) {
      if (!themeData?.variables) return;
      
      const root = document.documentElement;
      
      for (const [key, value] of Object.entries(themeData.variables)) {
        if (value && value.trim()) {
          root.style.setProperty(key, value);
        }
      }
      
      // Update data attribute for CSS selectors
      if (themeData.themeId) {
        root.setAttribute('data-theme', themeData.themeId);
        document.body?.setAttribute('data-theme', themeData.themeId);
      }
      
      // Dispatch custom event for app-specific reactions
      window.dispatchEvent(new CustomEvent('osThemeChanged', {
        detail: {
          themeId: themeData.themeId,
          variables: themeData.variables,
          timestamp: themeData.timestamp
        }
      }));
    },

    /**
     * Handle incoming messages from parent
     */
    handleMessage(event) {
      // Basic origin validation (relax in dev, tighten in prod)
      if (event.source !== window.parent) return;
      
      const data = event.data;
      if (!data?.type) return;

      // Update trusted origin after first valid message
      if (!this.parentOrigin || this.parentOrigin === '*') {
        this.parentOrigin = event.origin || '*';
      }

      switch (data.type) {
        case 'themeUpdate':
          this.applyTheme(data);
          break;
          
        case 'themeAck':
          // Parent acknowledged our request; re-request if needed
          if (!this.isReady) {
            this.isReady = true;
            window.dispatchEvent(new CustomEvent('osBridgeReady', {
              detail: { appId: this.appId }
            }));
          }
          break;
      }
    },

    /**
     * Notify parent that app is ready for theme sync
     */
    notifyReady() {
      try {
        window.parent.postMessage(
          { type: 'appReady', appId: this.appId, timestamp: Date.now() },
          this.parentOrigin
        );
      } catch (e) {
        console.warn('⚠ Bridge: Failed to notify ready', e);
      }
    },

    /**
     * Initialize bridge
     */
    init() {
      // Listen for parent messages
      window.addEventListener('message', (e) => this.handleMessage(e), false);
      
      // Request theme immediately
      this.requestTheme();
      
      // Retry request if no response in 500ms (parent may not be ready)
      setTimeout(() => {
        if (!this.isReady) {
          this.requestTheme();
        }
      }, 500);
      
      // Notify parent when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.notifyReady());
      } else {
        this.notifyReady();
      }
      
      // Handle page visibility changes (re-sync when tab becomes active)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.isReady) {
          this.requestTheme();
        }
      });
    }
  };

  // Start the bridge
  Bridge.init();

  // Expose API for app developers (optional)
  window.OsThemeBridge = {
    /**
     * Manually request theme update
     */
    refresh: () => Bridge.requestTheme(),
    
    /**
     * Listen for theme changes (alternative to event listener)
     * @param {Function} callback - Receives { themeId, variables }
     * @returns {Function} - Unsubscribe function
     */
    onChange: (callback) => {
      if (typeof callback !== 'function') return () => {};
      
      const handler = (e) => callback(e.detail);
      window.addEventListener('osThemeChanged', handler);
      return () => window.removeEventListener('osThemeChanged', handler);
    },
    
    /**
     * Get current theme variables
     */
    getVariables: () => {
      const root = document.documentElement;
      const vars = {};
      for (const name of root.style) {
        if (name.startsWith('--system-')) {
          vars[name] = root.style.getPropertyValue(name);
        }
      }
      return vars;
    }
  };

})();