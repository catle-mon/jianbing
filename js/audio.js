const SOUND_PATHS = {
  bgm: 'assets/audio/bgm_stall_loop.wav',
  ui: 'assets/audio/ui_click.wav',
  shop_open: 'assets/audio/shop_open.wav',
  restock: 'assets/audio/restock.wav',
  place: 'assets/audio/place.wav',
  flip: 'assets/audio/flip.wav',
  perfect: 'assets/audio/perfect.wav',
  serve_success: 'assets/audio/serve_success.wav',
  wrong: 'assets/audio/wrong.wav',
  burnt: 'assets/audio/burnt.wav',
  customer_leave: 'assets/audio/customer_leave.wav'
};

class AudioManager {
  constructor() {
    this.enabled = true;
    this.volume = 70;
    this.history = [];
    this.lastPlayed = null;
    this.bgmPlaying = false;
    this.canUseAudio = typeof wx !== 'undefined' && typeof wx.createInnerAudioContext === 'function';
    this.storageEnabledKey = 'gameSoundEnabled';
    this.storageVolumeKey = 'gameSoundVolume';
    this.contexts = {};
    this.bgm = null;

    this.loadSettings();
    if (this.canUseAudio) this.createContexts();
    this.applyVolume();
  }

  loadSettings() {
    try {
      const enabled = wx.getStorageSync(this.storageEnabledKey);
      if (typeof enabled === 'boolean') this.enabled = enabled;
      const volume = wx.getStorageSync(this.storageVolumeKey);
      if (Number.isFinite(Number(volume))) this.volume = this.clampVolume(Number(volume));
    } catch (e) {}
  }

  saveSettings() {
    try {
      wx.setStorageSync(this.storageEnabledKey, this.enabled);
      wx.setStorageSync(this.storageVolumeKey, this.volume);
    } catch (e) {}
  }

  clampVolume(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  createContext(src, loop = false) {
    if (!this.canUseAudio) return null;
    const audio = wx.createInnerAudioContext();
    audio.src = src;
    audio.loop = loop;
    audio.obeyMuteSwitch = false;
    audio.volume = this.enabled ? this.volume / 100 : 0;
    if (typeof audio.onError === 'function') audio.onError(() => {});
    return audio;
  }

  createContexts() {
    this.bgm = this.createContext(SOUND_PATHS.bgm, true);
    Object.keys(SOUND_PATHS).forEach(name => {
      if (name === 'bgm') return;
      this.contexts[name] = this.createContext(SOUND_PATHS[name], false);
    });
  }

  applyVolume() {
    const vol = this.enabled ? this.volume / 100 : 0;
    if (this.bgm) this.bgm.volume = vol;
    Object.values(this.contexts).forEach(audio => {
      if (audio) audio.volume = vol;
    });
  }

  setVolume(value) {
    this.volume = this.clampVolume(value);
    if (this.volume <= 0) this.enabled = false;
    this.applyVolume();
    this.saveSettings();
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.applyVolume();
    if (!this.enabled) this.pauseBgm();
    else if (this.bgmPlaying) this.playBgm(true);
    this.saveSettings();
  }

  toggleEnabled() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  play(name) {
    this.history.push(name);
    this.lastPlayed = name;
    if (!this.enabled || this.volume <= 0) return;
    const audio = name === 'bgm' ? this.bgm : this.contexts[name];
    if (!audio) return;
    try {
      if (typeof audio.stop === 'function') audio.stop();
      else if (typeof audio.seek === 'function') audio.seek(0);
    } catch (e) {}
    try { audio.play(); } catch (e) {}
  }

  playBgm(force = false) {
    this.history.push('bgm');
    this.lastPlayed = 'bgm';
    if (!this.enabled || this.volume <= 0 || !this.bgm) return;
    if (this.bgmPlaying && !force) return;
    this.bgmPlaying = true;
    try {
      if (typeof this.bgm.stop === 'function') this.bgm.stop();
    } catch (e) {}
    try { this.bgm.play(); } catch (e) {}
  }

  pauseBgm() {
    if (!this.bgm) return;
    try { if (typeof this.bgm.pause === 'function') this.bgm.pause(); } catch (e) {}
    this.bgmPlaying = false;
  }

  stopBgm() {
    if (!this.bgm) return;
    try { if (typeof this.bgm.stop === 'function') this.bgm.stop(); } catch (e) {}
    this.bgmPlaying = false;
  }
}

module.exports = AudioManager;
