/**
 * Alarm Sounds Module
 * Handles all Web Audio API sound generation for timer alarms
 * 
 * Usage:
 *   const alarmSounds = new AlarmSounds(audioContext);
 *   alarmSounds.playSoundPattern('classic', false, timerId);
 */
class AlarmSounds {
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
            
            osc.frequency.value = note.freq;
            osc.type = note.type || 'sine';
            
            gain.gain.setValueAtTime(0, currentTime);
            gain.gain.linearRampToValueAtTime(note.volume || 0.15, currentTime + attackTime);
            gain.gain.setValueAtTime(note.volume || 0.15, currentTime + note.duration - releaseTime);
            gain.gain.linearRampToValueAtTime(0, currentTime + note.duration);
            
            osc.start(currentTime);
            osc.stop(currentTime + note.duration + 0.05);
            
            currentTime += note.duration + note.gap;
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
        
        const now = this.audioCtx.currentTime;
        
        switch(type) {
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
            case 'minecraft-theme':
                this._playMinecraftTheme(now, isPreview, loopId, isEditPreview);
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
            { freq: 440.00, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.15 },
            { freq: 523.25, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.15 },
            { freq: 659.25, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.15 },
            { freq: 880.00, duration: 0.40, gap: 0.10, type: 'triangle', volume: 0.15 }
        ];
        this.playMelodySequence(melodyNotes, isPreview, loopId, isEditPreview);
    }

    _playMarioCoin(now, isPreview, loopId, isEditPreview) {
        const coinNotes = [
            { freq: 987.77, duration: 0.08, gap: 0.02, type: 'square', volume: 0.20 },
            { freq: 1318.51, duration: 0.25, gap: 0.10, type: 'square', volume: 0.20 }
        ];
        this.playMelodySequence(coinNotes, isPreview, loopId, isEditPreview);
    }

    _playMarioTheme(now, isPreview, loopId, isEditPreview) {
        const marioNotes = [
            { freq: 659.25, duration: 0.15, gap: 0.05, type: 'square', volume: 0.18 },
            { freq: 659.25, duration: 0.15, gap: 0.15, type: 'square', volume: 0.18 },
            { freq: 659.25, duration: 0.15, gap: 0.15, type: 'square', volume: 0.18 },
            { freq: 523.25, duration: 0.15, gap: 0.05, type: 'square', volume: 0.18 },
            { freq: 659.25, duration: 0.30, gap: 0.05, type: 'square', volume: 0.18 },
            { freq: 783.99, duration: 0.30, gap: 0.15, type: 'square', volume: 0.18 },
            { freq: 392.00, duration: 0.30, gap: 0.05, type: 'square', volume: 0.18 },
        ];
        this.playMelodySequence(marioNotes, isPreview, loopId, isEditPreview);
    }

    _playMinecraftTheme(now, isPreview, loopId, isEditPreview) {
        const minecraftNotes = [
            { freq: 523.25, duration: 0.50, gap: 0.10, type: 'sine', volume: 0.18 },
            { freq: 659.25, duration: 0.50, gap: 0.10, type: 'sine', volume: 0.18 },
            { freq: 783.99, duration: 0.50, gap: 0.10, type: 'sine', volume: 0.18 },
            { freq: 1046.50, duration: 1.00, gap: 0.15, type: 'sine', volume: 0.18 },
            { freq: 783.99, duration: 0.50, gap: 0.10, type: 'sine', volume: 0.18 },
            { freq: 659.25, duration: 0.50, gap: 0.10, type: 'sine', volume: 0.18 },
            { freq: 523.25, duration: 0.75, gap: 0.15, type: 'sine', volume: 0.18 }
        ];
        this.playMelodySequence(minecraftNotes, isPreview, loopId, isEditPreview);
    }

    _playSuccess(now, isPreview, loopId, isEditPreview) {
        const successNotes = [
            { freq: 523.25, duration: 0.15, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 659.25, duration: 0.15, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 783.99, duration: 0.15, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 1046.50, duration: 0.50, gap: 0.15, type: 'triangle', volume: 0.20 }
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
            { freq: 220.00, duration: 0.25, gap: 0.05, type: 'sawtooth', volume: 0.15 },
            { freq: 440.00, duration: 0.25, gap: 0.05, type: 'sawtooth', volume: 0.15 },
            { freq: 880.00, duration: 0.30, gap: 0.05, type: 'sawtooth', volume: 0.15 },
            { freq: 1760.00, duration: 0.50, gap: 0.15, type: 'sine', volume: 0.10 }
        ];
        this.playMelodySequence(spaceNotes, isPreview, loopId, isEditPreview);
    }

    _playCelebration(now, isPreview, loopId, isEditPreview) {
        const celebrationNotes = [
            { freq: 523.25, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 659.25, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 783.99, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 1046.50, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 1318.51, duration: 0.20, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 1046.50, duration: 0.10, gap: 0.05, type: 'triangle', volume: 0.20 },
            { freq: 1567.98, duration: 0.50, gap: 0.15, type: 'triangle', volume: 0.20 }
        ];
        this.playMelodySequence(celebrationNotes, isPreview, loopId, isEditPreview);
    }

    /**
     * Get duration in ms for a sound type (for preview timeouts)
     * @param {string} type - Sound type identifier
     * @returns {number} Duration in milliseconds
     */
    getSoundDuration(type) {
        const durations = {
            'classic': 1500,
            'gentle': 1500,
            'urgent': 1500,
            'melody': 2500,
            'mario-coin': 1500,
            'mario-theme': 4500,
            'minecraft-theme': 8000,
            'success': 3000,
            'digital': 2000,
            'space': 3500,
            'celebration': 4000
        };
        return durations[type] || 2000;
    }

    /**
     * Get loop interval in ms for a sound type
     * @param {string} type - Sound type identifier
     * @returns {number} Loop interval in milliseconds
     */
    getLoopInterval(type) {
        return this.getSoundDuration(type) + 1000;
    }

    /**
     * Stop all active oscillators and clear the list
     */
    stopAll() {
        this.activeOscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch(e) {
                // Oscillator may already be stopped
            }
        });
        this.activeOscillators = [];
    }

    /**
     * Get count of currently active oscillators (for debugging)
     * @returns {number} Count of active oscillators
     */
    getActiveCount() {
        return this.activeOscillators.length;
    }
}

// Export for browser global access
if (typeof window !== 'undefined') {
    window.AlarmSounds = AlarmSounds;
}

// Optional: Export for module bundlers (Webpack, etc.)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlarmSounds;
}