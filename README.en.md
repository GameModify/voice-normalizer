<div align="center">
  <h1>VoiceNormalizer</h1>
  <p>Voice leveling in Discord — for selected people or everyone in the channel.</p>
  <p>
    <a href="https://github.com/GameModify/voice-normalizer/releases/latest/download/VoiceNormalizer.plugin.js"><strong>Download plugin</strong></a> ·
    <a href="#quick-start">Installation</a> ·
    <a href="https://github.com/GameModify/voice-normalizer/releases">Releases</a> ·
    <a href="https://github.com/GameModify/voice-normalizer/issues/new">Report an issue</a>
  </p>
  <p>
    <img alt="BetterDiscord plugin" src="https://img.shields.io/badge/BetterDiscord-plugin-5865f2?style=flat-square" />
    <a href="https://github.com/GameModify/voice-normalizer/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/GameModify/voice-normalizer?style=flat-square&amp;label=release" /></a>
    <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-8e77ff?style=flat-square" /></a>
  </p>
  <p><a href="./README.md">Русский</a> · <strong>English</strong></p>
</div>

**Quiet speech gets louder; loud speech gets quieter.** The plugin learns each participant's ordinary voice and applies temporary correction separately from your Discord volume slider.

## Quick start

1. Install [BetterDiscord](https://betterdiscord.app/) for desktop Discord.
2. Download **[VoiceNormalizer.plugin.js](https://github.com/GameModify/voice-normalizer/releases/latest/download/VoiceNormalizer.plugin.js)**.
3. Open the plugins folder from BetterDiscord settings and place the file there. On Windows: `%APPDATA%\BetterDiscord\plugins`.
4. Enable VoiceNormalizer. Set a comfortable volume for the person while they speak normally.
5. Right-click them → **Level this user's voice**. Allow about two seconds of ordinary speech for calibration.

Only the plugin file is needed. Node.js and the **Source code** archives are unnecessary. The release also includes `LICENSE` and `SHA256SUMS.txt`.

These instructions cover Windows. Internet is needed to download the plugin and use Discord voice; the plugin has no separate server.

## Features

- **Selected people or the whole channel.** Choose **Everyone in the voice channel** in settings to include new participants automatically. Individuals can be excluded; your own voice is excluded.
- **Manual volume stays under your control.** Automatic correction does not move the slider. Manual changes establish a new baseline while preserving learning.
- **Smooth recovery.** Volume returns gradually during speech after a loud phrase. Pauses do not raise volume, and a zero setting keeps the person muted.
- **Selections persist.** Participants, exclusions, and profiles survive Discord restarts. Ordinary-speech calibration starts again after the plugin restarts.

**Only reduce loud voices** disables boosting above the manual baseline. Disabling processing restores the latest manual volume.

## Profiles

Start with **Balanced**.

| Profile | Correction range | Use |
| --- | --- | --- |
| Soft | ×0.65–1.3 | Small differences, gentle response |
| Balanced | ×0.45–2 | Everyday conversations |
| Aggressive | ×0.35–2 | Faster response and stronger attenuation |

These multiply internal playback volume relative to the manual baseline; they are not slider positions or measured decibels. Balanced and Aggressive share the same maximum boost; their correction strength and response speed differ.

<details>
<summary><strong>Individual profiles and detailed controls</strong></summary>

**Use default** follows global settings. A per-user profile overrides them for one person.

Click participant lists to expand them. Profiles are under **Individual settings** inside participant cards; detailed controls, language, and diagnostics are under **Advanced**.

If initial calibration only captures whispering or shouting, choose **Reset learning** while the person speaks normally. Their selection and profile are retained.

[Detailed settings (Russian)](./docs/SETTINGS.md).

</details>

## Updates and data

Preferences are stored locally in `VoiceNormalizer.config.json` next to the plugin. On Windows: **`%APPDATA%\BetterDiscord\plugins\VoiceNormalizer.config.json`**. The file contains user IDs and processing preferences.

To update, replace `VoiceNormalizer.plugin.js` with the file from the [latest release](https://github.com/GameModify/voice-normalizer/releases/latest). BetterDiscord reloads the plugin; participant selections, modes, and profiles are retained.

<details>
<summary><strong>Backup, upgrading from 1.3, and rollback</strong></summary>

You can back up the configuration to another folder before updating. Do not attach the entire file to a public issue.

When upgrading from 1.3, the old global target is no longer used: 1.4 learns each person's ordinary speech. Participant selections and other supported settings are retained; brief calibration is needed after updating.

To roll back, disable the plugin, replace its file with one from the [required release](https://github.com/GameModify/voice-normalizer/releases), and enable it again. Close Discord before restoring a backed-up configuration file.

</details>

## Limitations

The plugin adjusts volume using Discord statistics rather than processing audio samples, so the start of a sudden peak may pass before attenuation. Discord's internal methods can change; processing stays off if independent playback control is unavailable.

Compatibility with elevated volumes in BetterVolume has not been separately confirmed.

<details>
<summary><strong>Development and build</strong></summary>

Requires Node.js 22 or newer. Source code is in `src/`; the built plugin is `VoiceNormalizer.plugin.js`.

```sh
npm ci
npm run build
npm run check
npm test
```

Checks run against the completed build. `npm run package:release` also checks the distributable file with empty preferences and stages release assets.

[Development (Russian)](./CONTRIBUTING.md) · [Roadmap (Russian)](./docs/ROADMAP.md)

</details>

If something goes wrong, [open an issue](https://github.com/GameModify/voice-normalizer/issues/new) with the version, selected mode, reproduction steps, and expected result.

## License

The project's own code is available under [MIT](./LICENSE) © 2026 GameModify. Author: **GameModify** · [GameModify](https://github.com/GameModify).
