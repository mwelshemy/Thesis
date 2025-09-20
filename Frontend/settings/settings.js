class SettingsManager {
  constructor(form, messageDiv) {
    this.form = form;
    this.messageDiv = messageDiv;
    this.settingsKey = 'aiChatSettings';
    this.loadSettings();
    this.form.addEventListener('submit', (e) => this.saveSettings(e));
  }

  loadSettings() {
    const saved = localStorage.getItem(this.settingsKey);
    if (saved) {
      const settings = JSON.parse(saved);
      this.form.theme.value = settings.theme || 'light';
      this.form['ai-model'].value = settings['ai-model'] || 'gpt-3.5';
      this.form['code-highlighting'].checked = settings['code-highlighting'] ?? true;
    }
  }

  saveSettings(e) {
    e.preventDefault();
    const settings = {
      theme: this.form.theme.value,
      'ai-model': this.form['ai-model'].value,
      'code-highlighting': this.form['code-highlighting'].checked,
    };
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    this.messageDiv.textContent = "Settings saved!";
    setTimeout(() => { this.messageDiv.textContent = ""; }, 2000);
    ThemeManager.setTheme(settings.theme);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settings-form');
  const messageDiv = document.getElementById('settings-message');
  if (form && messageDiv) {
    new SettingsManager(form, messageDiv);
  }
});