---
"@cosyte/astm": patch
---

Parsing, validating and building take far less time and memory, and every parsed record, warning, error, checksum and written byte is the same as before.

- `parseAstmRecords` and `parseFramedAstm` read a field by slicing it between delimiters instead of building it a character at a time, read record bytes as text in bulk, and freeze the message as they build it instead of walking it afterwards. A large payload no longer costs many times its size: a framed 256 KiB base64 payload parses about 10 times faster with about a tenth of the peak heap.
- `serializeFramedAstm` and `composeAstmFrames` write frames straight into one buffer of the exact size, and the framed write no longer tokenizes a manufacturer or scientific record again to check that its line reads back.
- `buildAstmMessage` checks its delimiters once, not once a component, and escapes a value a run at a time.

One change a caller can see, and only through a property descriptor: on a record that `parseAstmRecords` or `parseFramedAstm` returns, `fields` is now an enumerable getter rather than a data property. A field with no repeat, component or escape character is built the first time `fields` is read, so a caller who reads only the modeled values (`value`, `units`, `status` and the rest) never pays for it. Reading `fields` gives the same frozen array on every read, `Object.keys`, `JSON.stringify`, object spread and `structuredClone` see it as before, and every record is still frozen. Code that reads `Object.getOwnPropertyDescriptor(record, "fields").value` should read `record.fields` instead. Every empty field is now one shared frozen object, which no caller can tell apart from a field of its own except by identity.
