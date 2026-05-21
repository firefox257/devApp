/**
 * Alarm Sounds Module
 * Handles all Web Audio API sound generation for timer alarms
 * 
 * Usage:
 *   const alarmSounds = new AlarmSounds(audioContext);
 *   alarmSounds.playSoundPattern('sweden', false, timerId);
 */
class AlarmSounds {
    // === SOUND REGISTRY: Centralized definition of all available sounds ===
    static SOUND_REGISTRY = [
        { value: 'classic', label: 'Classic Beep', category: 'basic' },
        { value: 'gentle', label: 'Gentle Chime', category: 'basic' },
        { value: 'urgent', label: 'Urgent Pulse', category: 'basic' },
        { value: 'melody', label: 'Ascending Melody', category: 'melodic' },
        { value: 'digital', label: 'Digital Clock', category: 'basic' },
        { value: 'space', label: 'Space Alert', category: 'ambient' },
        { value: 'success', label: 'Success Fanfare', category: 'melodic' },
        { value: 'celebration', label: 'Celebration', category: 'melodic' },
        { value: 'mario-coin', label: 'Mario Coin ⭐', category: 'retro', premium: true },
        { value: 'mario-theme', label: 'Mario Theme ⭐', category: 'retro', premium: true },
        { value: 'sweden', label: 'Minecraft: Sweden 🎵', category: 'ambient', premium: true, aliases: ['minecraft-theme'] },
        { value: 'golden', label: 'Golden (KPop) 🎤', category: 'pop', premium: true }
    ];

    /**
     * Get sound options for UI population
     * @param {boolean} includePremium - Whether to include premium/⭐ sounds
     * @returns {Array} Filtered array of sound option objects
     */
    static getSoundOptions(includePremium = true) {
        return includePremium 
            ? this.SOUND_REGISTRY 
            : this.SOUND_REGISTRY.filter(s => !s.premium);
    }

    /**
     * Get sound config by value (for backward compatibility with aliases)
     * @param {string} value - Sound type identifier
     * @returns {Object|null} Sound config object or null if not found
     */
    static getSoundConfig(value) {
        return this.SOUND_REGISTRY.find(s => 
            s.value === value || (s.aliases && s.aliases.includes(value))
        ) || null;
    }

    constructor(audioContext) {
        this.audioCtx = audioContext;
        this.activeOscillators = [];
    }

    /**
     * Play a sequence of notes (for melodies)
     * @param {Array} notes - Array of note objects with freq, duration, gap, type, volume
     * @param {boolean} isPreview - Whether this is a preview (shorter playback)
     * @param {string} loopId - Optional ID for looping sounds
     * @param {boolean} isEditPreview - Whether this is an edit modal preview
     */
    playMelodySequence(notes, isPreview = false, loopId = null, isEditPreview = false) {
        if (!this.audioCtx || this.audioCtx.state !== 'running') return;
        
        const startTime = this.audioCtx.currentTime;
        let currentTime = startTime;
        
        notes.forEach((note, index) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            
            if (isPreview || !loopId) {
                this.activeOscillators.push(osc);
            }
            
            const attackTime = 0.02;
            const releaseTime = 0.03;
            
            // 🔧 SAFETY FIX: Ensure duration is always >= releaseTime to prevent Web Audio API errors
            const safeDuration = Math.max(note.duration, 0.05);
            const effectiveRelease = Math.min(releaseTime, safeDuration * 0.5);
            
            osc.frequency.value = note.freq;
            osc.type = note.type || 'sine';
            
            // Envelope: Attack → Sustain → Release
            gain.gain.setValueAtTime(0, currentTime);
            gain.gain.linearRampToValueAtTime(note.volume || 0.15, currentTime + attackTime);
            gain.gain.setValueAtTime(note.volume || 0.15, currentTime + safeDuration - effectiveRelease);
            gain.gain.linearRampToValueAtTime(0, currentTime + safeDuration);
            
            osc.start(currentTime);
            osc.stop(currentTime + safeDuration + 0.05);
            
            // Advance time by duration + gap
            currentTime += safeDuration + note.gap;
        });
        
        if (loopId && typeof window !== 'undefined' && window.audioLoops && window.audioLoops[loopId]) {
            const totalDuration = currentTime - startTime;
            window.audioLoops[loopId].nextNoteTime = startTime + totalDuration;
        }
    }

    /**
     * Play a sound pattern by type
     * @param {string} type - Sound type identifier
     * @param {boolean} isPreview - Whether this is a preview
     * @param {string} loopId - Optional ID for looping sounds
     * @param {boolean} isEditPreview - Whether this is an edit modal preview
     */
    playSoundPattern(type, isPreview = false, loopId = null, isEditPreview = false) {
        if (!this.audioCtx || this.audioCtx.state !== 'running') return;
        
        // Resolve aliases to canonical sound type
        const config = AlarmSounds.getSoundConfig(type);
        const soundType = config ? config.value : type;
        
        const now = this.audioCtx.currentTime;
        
        switch(soundType) {
            case 'classic':
                this._playClassic(now);
                break;
            case 'gentle':
                this._playGentle(now);
                break;
            case 'urgent':
                this._playUrgent(now);
                break;
            case 'melody':
                this._playMelody(now, isPreview, loopId, isEditPreview);
                break;
            case 'mario-coin':
                this._playMarioCoin(now, isPreview, loopId, isEditPreview);
                break;
            case 'mario-theme':
                this._playMarioTheme(now, isPreview, loopId, isEditPreview);
                break;
            case 'sweden':
                this._playSweden(now, isPreview, loopId, isEditPreview);
                break;
            case 'success':
                this._playSuccess(now, isPreview, loopId, isEditPreview);
                break;
            case 'digital':
                this._playDigital(now);
                break;
            case 'space':
                this._playSpace(now, isPreview, loopId, isEditPreview);
                break;
            case 'celebration':
                this._playCelebration(now, isPreview, loopId, isEditPreview);
                break;
            case 'golden':
                this._playGolden(now, isPreview, loopId, isEditPreview);
                break;
        }
    }

    // ========== Private helper methods for each sound type ==========

    _playClassic(now) {
        const osc1a = this.audioCtx.createOscillator();
        const gain1a = this.audioCtx.createGain();
        osc1a.connect(gain1a);
        gain1a.connect(this.audioCtx.destination);
        osc1a.frequency.setValueAtTime(880, now);
        osc1a.type = 'square';
        gain1a.gain.setValueAtTime(0, now);
        gain1a.gain.linearRampToValueAtTime(0.2, now + 0.01);
        gain1a.gain.setValueAtTime(0.2, now + 0.14);
        gain1a.gain.linearRampToValueAtTime(0, now + 0.15);
        osc1a.start(now);
        osc1a.stop(now + 0.16);
        this.activeOscillators.push(osc1a);
        
        const osc1b = this.audioCtx.createOscillator();
        const gain1b = this.audioCtx.createGain();
        osc1b.connect(gain1b);
        gain1b.connect(this.audioCtx.destination);
        osc1b.frequency.setValueAtTime(1100, now + 0.2);
        osc1b.type = 'square';
        gain1b.gain.setValueAtTime(0, now + 0.2);
        gain1b.gain.linearRampToValueAtTime(0.2, now + 0.21);
        gain1b.gain.setValueAtTime(0.2, now + 0.34);
        gain1b.gain.linearRampToValueAtTime(0, now + 0.35);
        osc1b.start(now + 0.2);
        osc1b.stop(now + 0.36);
        this.activeOscillators.push(osc1b);
    }

    _playGentle(now) {
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(this.audioCtx.destination);
        osc2.frequency.setValueAtTime(523.25, now);
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.15, now + 0.02);
        gain2.gain.setValueAtTime(0.15, now + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc2.start(now);
        osc2.stop(now + 0.85);
        this.activeOscillators.push(osc2);
    }

    _playUrgent(now) {
        for (let i = 0; i < 4; i++) {
            const osc3 = this.audioCtx.createOscillator();
            const gain3 = this.audioCtx.createGain();
            osc3.connect(gain3);
            gain3.connect(this.audioCtx.destination);
            osc3.frequency.setValueAtTime(1500, now + (i * 0.15));
            osc3.type = 'triangle';
            gain3.gain.setValueAtTime(0, now + (i * 0.15));
            gain3.gain.linearRampToValueAtTime(0.3, now + (i * 0.15) + 0.01);
            gain3.gain.setValueAtTime(0.3, now + (i * 0.15) + 0.04);
            gain3.gain.linearRampToValueAtTime(0, now + (i * 0.15) + 0.05);
            osc3.start(now + (i * 0.15));
            osc3.stop(now + (i * 0.15) + 0.06);
            this.activeOscillators.push(osc3);
        }
    }

    _playMelody(now, isPreview, loopId, isEditPreview) {
        const melodyNotes = [
            { freq: 440.00, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.15 }, // A4
            { freq: 523.25, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.15 }, // C5
            { freq: 659.25, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.15 }, // E5
            { freq: 880.00, duration: 0.40, gap: 0.10, type: 'triangle', volume: 0.15 }  // A5
        ];
        this.playMelodySequence(melodyNotes, isPreview, loopId, isEditPreview);
    }

    _playMarioCoin(now, isPreview, loopId, isEditPreview) {
        const coinNotes = [
            { freq: 987.77, duration: 0.08, gap: 0.02, type: 'square', volume: 0.20 }, // B5
            { freq: 1318.51, duration: 0.25, gap: 0.10, type: 'square', volume: 0.20 }  // E6
        ];
        this.playMelodySequence(coinNotes, isPreview, loopId, isEditPreview);
    }

    _playMarioTheme(now, isPreview, loopId, isEditPreview) {
        // 🔧 FIX: Authentic Super Mario Bros. opening rhythm with consistent staccato triplet
        const marioNotes = [
            // Iconic opening: E-E-E staccato eighth-note triplet (≈120 BPM)
            { freq: 659.25, duration: 0.12, gap: 0.08, type: 'square', volume: 0.18 }, // E5
            { freq: 659.25, duration: 0.12, gap: 0.08, type: 'square', volume: 0.18 }, // E5
            { freq: 659.25, duration: 0.12, gap: 0.18, type: 'square', volume: 0.18 }, // E5 (phrase break)
            // Continuation: C-E-G quarter notes
            { freq: 523.25, duration: 0.25, gap: 0.10, type: 'square', volume: 0.18 }, // C5
            { freq: 659.25, duration: 0.25, gap: 0.10, type: 'square', volume: 0.18 }, // E5
            { freq: 783.99, duration: 0.35, gap: 0.15, type: 'square', volume: 0.18 }, // G5 (held)
            // Resolution down to G4
            { freq: 392.00, duration: 0.30, gap: 0.10, type: 'square', volume: 0.18 }, // G4
        ];
        this.playMelodySequence(marioNotes, isPreview, loopId, isEditPreview);
    }

    _playSweden(now, isPreview, loopId, isEditPreview) {
        // 🔧 FIX: Legato flow with reduced gaps for authentic Minecraft Sweden atmosphere
        const swedenNotes = [
            // Main phrase: F-A-C-D-C-A-F (gentle, flowing pentatonic)
            { freq: 349.23, duration: 0.50, gap: 0.08, type: 'sine', volume: 0.14 }, // F4
            { freq: 440.00, duration: 0.50, gap: 0.08, type: 'sine', volume: 0.14 }, // A4
            { freq: 523.25, duration: 0.50, gap: 0.08, type: 'sine', volume: 0.14 }, // C5
            { freq: 587.33, duration: 0.70, gap: 0.10, type: 'sine', volume: 0.14 }, // D5 (held longer)
            { freq: 523.25, duration: 0.50, gap: 0.08, type: 'sine', volume: 0.14 }, // C5
            { freq: 440.00, duration: 0.50, gap: 0.08, type: 'sine', volume: 0.14 }, // A4
            { freq: 349.23, duration: 0.70, gap: 0.15, type: 'sine', volume: 0.14 }, // F4 (phrase end)
            // Second phrase: G-A-C resolution
            { freq: 392.00, duration: 0.45, gap: 0.08, type: 'sine', volume: 0.12 }, // G4
            { freq: 440.00, duration: 0.45, gap: 0.08, type: 'sine', volume: 0.12 }, // A4
            { freq: 523.25, duration: 0.60, gap: 0.20, type: 'sine', volume: 0.13 }, // C5 (final resolution)
        ];
        this.playMelodySequence(swedenNotes, isPreview, loopId, isEditPreview);
    }

    _playSuccess(now, isPreview, loopId, isEditPreview) {
        const successNotes = [
            { freq: 523.25, duration: 0.15, gap: 0.05, type: 'triangle', volume: 0.20 }, // C5
            { freq: 659.25, duration: 0.15, gap: 0.05, type: 'triangle', volume: 0.20 }, // E5
            { freq: 783.99, duration: 0.15, gap: 0.05, type: 'triangle', volume: 0.20 }, // G5
            { freq: 1046.50, duration: 0.50, gap: 0.15, type: 'triangle', volume: 0.20 }  // C6
        ];
        this.playMelodySequence(successNotes, isPreview, loopId, isEditPreview);
    }

    _playDigital(now) {
        for (let i = 0; i < 6; i++) {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.frequency.setValueAtTime(1000, now + (i * 0.25));
            osc.type = 'square';
            gain.gain.setValueAtTime(0, now + (i * 0.25));
            gain.gain.linearRampToValueAtTime(0.2, now + (i * 0.25) + 0.01);
            gain.gain.setValueAtTime(0.2, now + (i * 0.25) + 0.09);
            gain.gain.linearRampToValueAtTime(0, now + (i * 0.25) + 0.10);
            osc.start(now + (i * 0.25));
            osc.stop(now + (i * 0.25) + 0.11);
            this.activeOscillators.push(osc);
        }
    }

    _playSpace(now, isPreview, loopId, isEditPreview) {
        const spaceNotes = [
            { freq: 220.00, duration: 0.25, gap: 0.05, type: 'sawtooth', volume: 0.15 }, // A3
            { freq: 440.00, duration: 0.25, gap: 0.05, type: 'sawtooth', volume: 0.15 }, // A4
            { freq: 880.00, duration: 0.30, gap: 0.05, type: 'sawtooth', volume: 0.15 }, // A5
            { freq: 1760.00, duration: 0.50, gap: 0.15, type: 'sine', volume: 0.10 }     // A6
        ];
        this.playMelodySequence(spaceNotes, isPreview, loopId, isEditPreview);
    }

    _playCelebration(now, isPreview, loopId, isEditPreview) {
        const celebrationNotes = [
            { freq: 523.25, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 }, // C5
            { freq: 659.25, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 }, // E5
            { freq: 783.99, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 }, // G5
            { freq: 1046.50, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 }, // C6
            { freq: 1318.51, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.20 }, // E6
            { freq: 1046.50, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 }, // C6
            { freq: 1567.98, duration: 0.50, gap: 0.15, type: 'triangle', volume: 0.20 }  // G6
        ];
        this.playMelodySequence(celebrationNotes, isPreview, loopId, isEditPreview);
    }

    _playGolden(now, isPreview, loopId, isEditPreview) {
        // Note sequence follows a catchy K-pop style progression
        // Frequencies verified; rhythm designed for ~128 BPM tempo
        const goldenNotes = [
            { freq: 440.00, duration: 0.12, gap: 0.03, type: 'triangle', volume: 0.18 }, // A4
            { freq: 493.88, duration: 0.12, gap: 0.03, type: 'triangle', volume: 0.18 }, // B4
            { freq: 493.88, duration: 0.12, gap: 0.03, type: 'triangle', volume: 0.18 }, // B4
            { freq: 493.88, duration: 0.12, gap: 0.08, type: 'triangle', volume: 0.18 }, // B4 (phrase break)
            { freq: 392.00, duration: 0.12, gap: 0.03, type: 'triangle', volume: 0.18 }, // G4
            { freq: 440.00, duration: 0.12, gap: 0.03, type: 'triangle', volume: 0.18 }, // A4
            { freq: 493.88, duration: 0.12, gap: 0.03, type: 'triangle', volume: 0.18 }, // B4
            { freq: 493.88, duration: 0.12, gap: 0.10, type: 'triangle', volume: 0.18 }, // B4 (phrase break)
            { freq: 587.33, duration: 0.25, gap: 0.15, type: 'triangle', volume: 0.20 }, // D5 (chorus lift)
            { freq: 698.46, duration: 0.15, gap: 0.05, type: 'sine', volume: 0.19 },     // F5
            { freq: 659.25, duration: 0.15, gap: 0.05, type: 'sine', volume: 0.19 },     // E5
            { freq: 783.99, duration: 0.20, gap: 0.10, type: 'sine', volume: 0.20 },     // G5
            { freq: 587.33, duration: 0.10, gap: 0.04, type: 'square', volume: 0.22 },   // D5 (accent)
            { freq: 659.25, duration: 0.10, gap: 0.04, type: 'square', volume: 0.22 },   // E5
            { freq: 783.99, duration: 0.10, gap: 0.04, type: 'square', volume: 0.22 },   // G5
            { freq: 880.00, duration: 0.15, gap: 0.05, type: 'square', volume: 0.23 },   // A5
            { freq: 783.99, duration: 0.30, gap: 0.20, type: 'sine', volume: 0.20 },     // G5 (resolution)
        ];
        this.playMelodySequence(goldenNotes, isPreview, loopId, isEditPreview);
    }

    getSoundDuration(type) {
        const config = AlarmSounds.getSoundConfig(type);
        const soundType = config ? config.value : type;
        
        // 🔧 UPDATED: Durations reflect corrected note timing and gaps
        const durations = {
            'classic': 1500,
            'gentle': 1500,
            'urgent': 1500,
            'melody': 2500,
            'mario-coin': 1200,      // Shortened: 2 quick notes
            'mario-theme': 3800,     // Adjusted: tighter rhythm, authentic timing
            'sweden': 6800,          // Adjusted: reduced gaps for legato flow
            'success': 3000,
            'digital': 2000,
            'space': 3500,
            'celebration': 4000,
            'golden': 4200
        };
        return durations[soundType] || 2000;
    }

    getLoopInterval(type) {
        // Add 1 second buffer between loops for natural breathing room
        return this.getSoundDuration(type) + 1000;
    }

    stopAll() {
        this.activeOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch(e) {}
        });
        this.activeOscillators = [];
    }

    getActiveCount() {
        return this.activeOscillators.length;
    }
}

// Export for browser global access
if (typeof window !== 'undefined') {
    window.AlarmSounds = AlarmSounds;
}

// Optional: Export for module bundlers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlarmSounds;
}