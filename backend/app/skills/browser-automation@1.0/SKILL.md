# Browser Automation Skill

## Version: 1.0
## Type: Execution / Research
## Sub-System: Vercel Agent Browser CLI

### Objective
Provide ZAI agents with autonomous web browsing capabilities using the `agent-browser` CLI. This allows agents to visually interact with dynamic websites, bypass basic blocks by acting as a real user, and extract information or perform actions where standard APIs do not exist.

### Core Capabilities
1. **Web Navigation**: Access any URL, including SPAs and heavily JS-driven pages.
2. **Snapshot Extraction**: Convert visually rendered DOMs into minimal Accessibility Trees (`@e1`, `@e2` refs) that are easily digestible by LLMs.
3. **Interactive Control**: Click buttons, fill forms, check boxes, and interact using the refs from the snapshot.
4. **Data Scraping**: Extract precise text, innerHTML, or attribute data.

### Standard Workflow
1. **Initialize Browser**:
   `agent-browser open https://example.com`
2. **Capture State (Snapshot)**:
   `agent-browser snapshot` -> Extracts the DOM with reference IDs.
3. **Perform Action**:
   `agent-browser click @e1`
   `agent-browser fill @e2 "Search query"`
   `agent-browser press Enter`
4. **Retrieve Results**:
   Wait for load: `agent-browser wait --load networkidle`
   Capture new state: `agent-browser snapshot`
5. **Close Session**:
   `agent-browser close`

### Usage Rules
- NEVER use generic XPath or long CSS selectors. Always run `agent-browser snapshot` first, read the accessibility tree, and use the provided `@eX` reference IDs.
- Handle popups/dialogs automatically unless explicit interaction is required.
- Do NOT extract full HTML (`agent-browser get html "body"`) unless specifically requested, as it overflows token limits. Rely on `snapshot` which is optimized for LLMs.
