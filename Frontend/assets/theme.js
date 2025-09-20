class ThemeManager {
  static THEME_KEY = 'aiChatSettings';

  static loadTheme() {
    let theme = 'light';
    const settings = localStorage.getItem(ThemeManager.THEME_KEY);
    if (settings) {
      try {
        theme = JSON.parse(settings).theme || 'light';
      } catch {}
    }
    document.body.setAttribute('data-theme', theme);

    // Apply to major containers if needed
    document.querySelectorAll('.github-header, .chat-container, .settings-container, .chat-header, .settings-header, .message .text, .message.user .text, #chat-input, #chat-form button, #settings-form button, footer')
      .forEach(el => el && el.setAttribute('data-theme', theme));
  }

  static setTheme(theme) {
    // Update localStorage
    let settings = {};
    try {
      settings = JSON.parse(localStorage.getItem(ThemeManager.THEME_KEY)) || {};
    } catch {}
    settings.theme = theme;
    localStorage.setItem(ThemeManager.THEME_KEY, JSON.stringify(settings));
    ThemeManager.loadTheme();
  }
}

// Load theme on page load
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.loadTheme();
});