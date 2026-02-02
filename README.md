# Telegram Auto Chat Delete (Clean Up Your Telegram Chats)

**Say goodbye to clutter—wipe your entire Telegram Web chat list in just minutes!**

This handy userscript allows you to bulk delete or leave chats (whether they’re direct messages, groups, channels, or bots) while giving you a user-friendly overlay that shows your progress.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Use This Tool?

- Are you overwhelmed with too many chats piling up?
- Tired of clicking "delete" or "leave" for each chat one by one?
- Want to refresh your Telegram experience without spending hours on it?

This script automates the process for you, saving you time and effort! It keeps your **Saved Messages** intact by default and provides a pleasant progress display while it works.

## Key Features

- Deletes or leaves **all** chats (or almost everything)
- Option to preserve **Saved Messages** (highly recommended)
- Live counter with a breakdown by chat type
- A sleek, dark modal UI that mirrors the Telegram aesthetic
- Double confirmation step to prevent accidental deletions
- Automatically skips problematic or restricted chats
- Clear console logging to help with any debugging issues

## What You’ll Need

- Access to Telegram **Web** → [Visit here](https://web.telegram.org)
- A modern browser (Chrome, Edge, Firefox, etc.)

## Quick Start Guide (Takes about 30 seconds)

1. Open [Telegram Web](https://web.telegram.org) and log in.
2. Press **F12** (or right-click and select "Inspect") and navigate to the **Console** tab.
3. Copy and paste the entire content of **`telegram-auto-delete.js`** into the console.
4. Press **Enter.**

→ You’ll see a small control panel appear in the center of your screen!

![telegram autom delete chats](https://raw.githubusercontent.com/atarevals/telegram-auto-delete/refs/heads/main/assets/startUI.png)


5. (Optional) If you want to delete your **Saved Messages** too, uncheck the "Keep Saved Messages" option.
6. Click **Start**, confirm your choice, then sit back and relax while it works its magic.

![telegram autom delete chats](https://github.com/atarevals/telegram-auto-delete/blob/main/assets/progressUI.png)

**Important:** Please do **not** interact with the tab while it’s running.

**Duration:** Typically, it takes between 1 to 5 minutes, depending on how many chats you have.

![telegram autom delete chats](https://raw.githubusercontent.com/atarevals/telegram-auto-delete/refs/heads/main/assets/complateUI.png)

## What Happens During the Process?

| Chat Type       | Action Taken                  | Visible to Others?       |
|-----------------|-------------------------------|--------------------------|
| Private (DM)    | Chat deleted                  | Yes (deleted for both)   |
| Group           | Left the group                | No (you just disappear)  |
| Channel         | Left the channel              | No                       |
| Bot             | Chat deleted (sometimes blocked) | Usually no             |
| Saved Messages   | Preserved (default setting)   | —                        |

Rest assured, your **contacts**, **profile**, and any **groups you manage** remain completely safe during this process.

## License Information

This script is released under the MIT License.

Feel free to fork, modify, or share it—there are no restrictions. 

I created this tool because I was tired of spending over 40 minutes manually cleaning up over 500 chats. I hope it helps you save time and hassle too!

Feel free to reach out with PRs, issues, or suggestions. Your feedback is always welcome
