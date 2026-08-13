# Architecture Notes & Feasibility Studies

## Item #27: SMS / Mobile Messaging Feasibility Note (Part C)

### Requirement Overview
The spec poses an exploratory question: *"Would it be possible to send messages to mobile phones... similar to healthcare services... recipient cannot reply?"*

This requirement describes a one-way transactional SMS notification system (e.g. automated appointment reminders, urgent school announcements) sent to students' mobile phone numbers without supporting inbound SMS reply threads.

---

### 1. Vendor Integration Requirements
To support outbound SMS delivery from the application, an external SMS Gateway API provider is required. Standard providers in Sweden/Europe include:
- **46elks** (Swedish native provider, REST API, custom Sender ID support)
- **Sinch** (Global Swedish enterprise SMS gateway)
- **Twilio** (Global SMS REST API)

#### External Credentials & Config Needed:
- `SMS_VENDOR_API_KEY` / `SMS_ACCOUNT_SID` & `SMS_AUTH_TOKEN`
- `SMS_SENDER_ID` (alphanumeric tag like `"Mindful"` or registered virtual number)
- Webhook endpoint for delivery receipt callback (e.g. `POST /api/messages/sms-status`)

---

### 2. Integration Architecture with Messaging System (Part A)

The internal messaging system built in Part A (`backend/src/services/messagingService.js`, `Conversation`, `Message`) serves as the foundation for multi-channel messaging.

#### Extension Points:
1. **Student Mobile Number Source**: `Student.phone` or `User.phone` (normalized to E.164 format, e.g. `+46701234567`).
2. **Channel Selection**: `Message` model extended with `channel: "INTERNAL" | "SMS"` (default `"INTERNAL"`).
3. **Outbound Dispatcher Hook**:
   ```javascript
   // In backend/src/services/messagingService.js
   export const dispatchSmsNotification = async (message, recipientPhone) => {
     if (!process.env.SMS_VENDOR_API_KEY) {
       logger.info({ messageId: message._id }, "SMS dispatch skipped — vendor credentials not configured");
       return { status: "STUBBED" };
     }
     // Vendor API call (e.g., fetch to 46elks / Twilio API)
   };
   ```
4. **One-Way Enforcement**: SMS threads in Part A would be tagged as `readOnly: true` or `oneWay: true` for the student recipient, disabling reply inputs in `MessagingView.vue` and preventing inbound SMS processing.

---

### 3. Out-of-Scope Pending Credentials & Vendor Selection
The following items remain strictly out of scope until vendor procurement and credentials are provided (matching the Scrive credential gap treatment in checklist item #19):
- Active SMS gateway vendor subscription and API credentials.
- Paid SMS message volume/rate limiting and cost management infrastructure.
- Inbound carrier DND (Do Not Disturb) / opt-out compliance (e.g. "STOP" keyword handling).
