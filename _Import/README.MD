# WxCC Search API Tool

A powerful web-based interface for querying Webex Contact Center (WxCC) data using the GraphQL Search API. Features OAuth authentication, preset queries, real-time data extraction, and interactive JSON parsing.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🚀 Features

### Authentication
- **OAuth 2.0 Integration** - Secure "Sign in with Webex" authentication
- **Automatic Token Management** - Tokens stored in localStorage and shared across all tools
- **Organization Detection** - Automatically fetches and displays your Webex organization

### Time Window Management
- **Preset Ranges** - Quick selection: 10m, 1h, 1d, 5d, 7d
- **Custom Date/Time Picker** - Set precise time ranges with calendar and time inputs
- **Auto-Update** - Epoch timestamps automatically update in queries
- **Visual Feedback** - Active time range is highlighted

### Query Presets
Pre-built queries for common use cases:
- **Task IDs** - Retrieve task IDs for a time window
- **Basic Fields** - Comprehensive task data with all standard fields
- **Interactions by ANI** - Search by phone number
- **Lookup ANI to Global Variable** - Match ANI with custom variables
- **Real-time Queued Tasks** - Monitor active queued calls
- **Advanced Aggregates** - Sum, count, and average calculations
- **Interaction Details** - Detailed task information by phone number
- **Last Agent Interaction** - Most recent agent activity for a number
- **Agent Session State** - Currently active agents
- **Wallboard: Queue Metrics** - Queue performance statistics
- **Realtime Queued Count** - Current queue depth
- **Realtime Agents Logged In** - Active agent count
- **Logged On Agents** - Agents by team ID
- **Times Called** - Call frequency by phone number

### Interactive JSON Parsing
- **Clickable Keys** - Click any JSON key to extract its value
- **JSONPath Generation** - Automatically generates JSONPath expressions
- **Array Index Detection** - Correctly identifies array positions (e.g., `tasks[3].id`)
- **Value Extraction** - Displays extracted values in real-time
- **Copy to Clipboard** - One-click copy for paths and values

### Query Management
- **Dynamic Parameters** - Automatically detects `<placeholders>` in queries
- **Input Fields** - Auto-generates input fields for parameters
- **Query History** - Tracks recent queries for quick reuse
- **Custom Presets** - Save your own queries for future use
- **Import/Export** - Backup and share custom presets

## 📋 Prerequisites

- Webex Contact Center account with API access
- Valid Webex Integration credentials (Client ID & Client Secret)
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🛠️ Setup

### 1. Create Webex Integration

1. Go to [Webex Developer Portal](https://developer.webex.com)
2. Navigate to **My Webex Apps** → **Create a New App** → **Integration**
3. Configure your integration:
   - **Integration Name**: WxCC Search API Tool
   - **Redirect URI**: `https://yourdomain.com/API_UI/callback.html`
   - **Scopes**: 
     - `spark:all`
     - `spark:organizations_read`
     - `cjp:config`
     - `cjp:config_read`
     - `cjp:config_write`
4. Save your **Client ID** and **Client Secret**

### 2. Configure the Application

Edit `pages/wxcc/searchapi.html` and update the OAuth configuration:

```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const REDIRECT_URI = 'https://yourdomain.com/API_UI/callback.html';
const SCOPES = 'spark:all spark:organizations_read cjp:config cjp:config_read cjp:config_write audit:events_read spark-admin:licenses_read spark-admin:telephony_config_read spark-admin:telephony_config_write';
```

Also update `callback.html` with the same credentials:

```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'https://yourdomain.com/API_UI/callback.html';
```


### Basic Workflow

1. **Authenticate**
   - Click the "Authenticate" button in the bottom-right corner
   - Sign in with your Webex credentials
   - You'll be redirected back after successful authentication

2. **Select Time Window**
   - Choose a preset range (10m, 1h, 1d, 5d, 7d)
   - Or click "Custom Time" for precise date/time selection
   - Timestamps update automatically

3. **Choose a Query**
   - Select from the preset dropdown
   - Query auto-populates in the editor
   - Fill in any required parameters (like phone numbers or team IDs)

4. **Execute Query**
   - Click "Update" to apply parameters
   - Click "SEND" to execute the query
   - Results appear in the Response section

5. **Extract Data**
   - Click any cyan-colored key in the JSON response
   - JSONPath expression appears automatically
   - Extracted value shows below
   - Copy button available for both path and value

### Advanced Features

#### Custom Queries
1. Select the blank preset at the top of dropdown
2. Write your GraphQL query
3. Use `{{FROM}}` and `{{TO}}` for time window variables
4. Use `<parameter name>` for dynamic inputs
5. Save as custom preset for reuse

#### Parameter Placeholders
The tool automatically detects placeholders in your queries:
```graphql
{
  task(
    from: {{FROM}}
    to: {{TO}}
    filter: {
      origin: { equals: "<phone number>" }
    }
  ) {
    tasks { id }
  }
}
```

This generates an input field labeled "phone number" with an Update button.

#### Array Navigation
When working with arrays in responses:
```json
"tasks": [
  { "id": "abc123" },  // [0]
  { "id": "def456" },  // [1]
  { "id": "ghi789" }   // [2]
]
```
Clicking on the second task's "id" generates: `$.data.task.tasks[1].id`

## 🔧 Configuration

### Time Ranges
Modify the preset time ranges in the JavaScript:
```javascript
<button class="action secondary range-btn" data-range="600000">10m</button>
<!-- data-range is in milliseconds -->
```

### Custom Presets
Add to the `BUILTIN_PRESETS` array:
```javascript
{
  key: 'myQuery',
  label: 'My Custom Query',
  query: `{
    task(
      from: {{FROM}}
      to: {{TO}}
    ) {
      tasks { id }
    }
  }`
}
```

### Styling
The application uses CSS custom properties for theming:
```css
:root {
  --bg: #0a0f1a;
  --card: #131921;
  --accentA: #159DD8;
  --accentB: #159DD8;
}
```

## 📊 API Reference

### WxCC Search API Endpoints

**Base URL**: `https://api.wxcc-us1.cisco.com/search`

**Authentication**: Bearer token (OAuth 2.0)

**Common Query Structure**:
```graphql
{
  task(
    from: <epoch_timestamp>
    to: <epoch_timestamp>
    filter: { ... }
    aggregations: [ ... ]
    pagination: { cursor: "0" }
  ) {
    tasks { ... }
    pageInfo { endCursor hasNextPage }
  }
}
```

For full API documentation, visit: [Webex Contact Center Developer Portal](https://developer.webex-cx.com/documentation/search)

## 📞 Support

For issues related to:
- **WxCC Search API**: Contact CX Advandced Solutions Support
- **Developer Portal**: Visit [Webex Developer Portal](https://developer.webex.com)

## 🙏 Acknowledgments

Built for the Webex Contact Center to simplify API interactions.

---

**Version**: 1.0.3
**Last Updated**: Jan 2026 
**Author**: Kenley Richardson
