---
"@cosyte/astm": patch
---

The documentation of `AstmMessage.classification` now says what it has always done: it classifies the whole parsed stream, not one message, so a `Q` in any message of a multi-message stream makes the whole stream read as a host query. To classify one message, call `classifyMessage(m.records)` on each message from `messages()`.

The type documentation of `AstmMessageClassification`, `AstmMessageKind`, `QueryRecord`, `UnsupportedRecord`, `classifyMessage` and `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND` says the same, and that warning's message text now reads "Stream carried both" rather than "Message carried both", because a `Q` in one message and an `R` in another raise it too. Classification, warning codes and every other value are unchanged.
