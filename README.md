<img width="1280" height="640" alt="tax-ui-github-og" src="https://github.com/user-attachments/assets/780f6743-669c-44e5-96fb-cc65249b5c75" />

# Tax UI

Tax UI helps you visualize and understand your tax returns in a beautiful UI. Chat with your tax history to get advice or find insights in your historical returns.

## Get Started

### 1. Install Bun

Tax UI runs on [Bun](https://bun.sh), a fast JavaScript runtime.

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Get a Gemini API Key

Tax UI uses Google's Gemini to parse and analyze your tax returns. Get an API key from [aistudio.google.com](https://aistudio.google.com/apikey).

### 3. Configure the API Key

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```
GEMINI_API_KEY=your-key-here
```

### 4. Run Tax UI

```bash
git clone https://github.com/brianlovin/tax-ui
cd tax-ui
bun install
bun run dev
```

Open [localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **Upload** your tax return PDFs (upload a single PDF per year)
2. **Review** parsed income, deductions, and tax breakdowns
3. **Chat** with Gemini to understand your tax situation

## Privacy & Security

### How Your Data is Processed

Your tax data is processed locally and sent directly to Google's Gemini API using your own API key. No data is stored on any third-party servers.

- Tax return PDFs are sent to Google's Gemini API for parsing
- Parsed data is stored only on your local machine
- Your API key stays on your computer and is never transmitted elsewhere

Google's API terms govern data processing. See [Google AI Privacy Policy](https://policies.google.com/privacy).

### Verify It Yourself

Tax UI is open source. You can review the code yourself, or ask an AI to audit it for you. Copy the prompt below and paste it into Claude, ChatGPT, or any other AI assistant:

<details>
<summary>Copy security audit prompt</summary>

```
I want you to perform a security and privacy audit of Tax UI, an open source tax return parser.

Repository: https://github.com/brianlovin/tax-ui

Please analyze the source code and verify:

1. DATA HANDLING
   - Tax return PDFs are sent directly to Google's Gemini API for parsing
   - No data is sent to any other third-party servers
   - Parsed data is stored locally only

2. NETWORK ACTIVITY
   - Identify all network requests in the codebase
   - Verify the only external calls are to Google's Gemini API
   - Check for any hidden data collection or tracking

3. API KEY SECURITY
   - Verify API keys are stored locally and not transmitted elsewhere
   - Check that keys are not logged or exposed

4. CODE INTEGRITY
   - Look for obfuscated or suspicious code
   - Review dependencies for anything concerning

Key files to review:
- src/index.ts (Bun server and API routes)
- src/lib/parser.ts (Gemini API integration)
- src/lib/storage.ts (Local file storage)
- src/App.tsx (React frontend)

Report any privacy or security concerns. I'm considering using this app with sensitive tax data.
```

</details>

## Requirements

- [Bun](https://bun.sh) v1.0 or later
- [Gemini API key](https://aistudio.google.com/apikey)
- Your own tax return PDFs
