# GitHub repository description

The single line this repository proposes for its GitHub "About" description,
committed here so it can be read, reviewed and copied without anyone having to
retype it.

The line is built from the description formula shared across the sibling
`@cosyte/*` healthcare-standard parsers, so the repositories read as one product
family rather than as independently worded projects.

## Proposed line

```text
ASTM parser, serializer, and builder for Node.js and TypeScript: lenient on parse, spec-clean on emit.
```

It is byte-identical to the `description` field in `package.json`, which is the
same sentence npm renders on the package page.

## The formula

    <STANDARD> <capabilities> for Node.js and TypeScript: <differentiator>.

- `<STANDARD>`: the healthcare data standard this repository implements, named
  the way the sibling repositories name it. Here that token is `ASTM`, and the
  line starts with it.
- `<capabilities>`: the primary artifacts the package ships, as a comma separated
  noun list. Here: `parser, serializer, and builder`.
- `for Node.js and TypeScript`: verbatim, identical in every sibling repository.
  It is the phrase that makes them read as one family.
- `<differentiator>`: one short clause on what this implementation is like, with
  no marketing superlatives, no version numbers and no links. Here:
  `lenient on parse, spec-clean on emit`, the clause the package `description`
  already carried, which names the two directions the package works in rather
  than praising it.
- Terminated by a single `.`.

## Constraints

Every one of these is checkable by reading the fenced line above.

1. Exactly one line, with no embedded newline.
2. Between 40 and 140 characters inclusive. Counted from the fenced line above,
   this one is 102.
3. Printable US-ASCII only: no en dash, no em dash, no smart quotes, no emoji.
4. Begins with `ASTM ` and contains `for Node.js and TypeScript`.
5. Ends with a `.`, and carries no leading or trailing whitespace.

## Was a rewrite required?

No. The `description` already in `package.json` was checked against all five
constraints and against every clause of the formula, and it satisfies each one,
so it is proposed verbatim and the field was left byte-unchanged. The field was
present and non-empty, so no line had to be derived to replace an absent one. No
constraint failed, so there is no failing constraint to name here.

## Application status

**NOT APPLIED.** This file is a proposal of record and nothing more. The GitHub
repository description field has not been changed, and this file makes no claim
about what that field holds today: producing this file involved no read of it and
no write to it.

Applying it is the repository operator's action. Copy the fenced line above into
the GitHub repository description field, with no editing. Nothing else in this
repository changes when they do.
