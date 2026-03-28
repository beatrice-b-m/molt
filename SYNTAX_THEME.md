# Primer Light — Syntax Highlighting Color Reference

> Reference document for configuring syntax highlighting to match the Primer Light VSCode theme.  
> Source: `beatrice-b-m/primer-light` (fork of `andrewmarkle/primer-light`)  
> Theme type: **light**, background `#FFFFFF`, default foreground `#333333`

---

## Core Syntax Palette

These are the named roles and their hex values as used throughout `tokenColors`.

| Role                      | Hex       | Notes                                                                                                         |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| Default text              | `#333333` | Variables, parameters, operators, delimiters, separators                                                      |
| Comments                  | `#969896` | `comment`, `punctuation.definition.comment`                                                                   |
| Keywords / Storage        | `#A71D5D` | `keyword`, `storage`, `meta.selector`, `markup.italic`                                                        |
| Variables                 | `#ED6A43` | `variable`, `variable.other.*`, link text, list markers                                                       |
| Functions / Constants     | `#795DA3` | `entity.name.function`, `support.function`, `constant`, regex, escape chars, link URLs, headings, bold markup |
| Strings                   | `#4180C6` | `string`, `constant.other.symbol`, `constant.language.symbol`, inherited classes                              |
| Classes / Integers        | `#0086B3` | `support.class`, `entity.name.class`, `entity.name.type.class`, `constant.numeric`                            |
| Punctuation (definitions) | `#173591` | `punctuation.definition.string`, `.variable`, `.parameters`, `.array`                                         |
| Interpolation             | `#AB7967` | `punctuation.section.embedded`, `variable.interpolation`                                                      |
| Units                     | `#5C9966` | `keyword.other.unit`                                                                                          |
| Inline code (markup)      | `#183691` | `markup.raw.inline`                                                                                           |

---

## Language-Specific Overrides

These scopes have dedicated colors that differ from the generic roles above.

### HTML

| Role                       | Hex                  | Scope / Notes                                                              |
| -------------------------- | -------------------- | -------------------------------------------------------------------------- |
| Tag names                  | `#63A3A4`            | `entity.name.tag` (teal-gray)                                              |
| Tag punctuation (`<`, `>`) | `#333333`            | `punctuation.definition.tag.begin/end.html` — same as default text         |
| Attribute names            | `#91B3E0` + _italic_ | `meta.tag entity.other.attribute-name`, `entity.other.attribute-name.html` |
| HTML entities              | `#AB6526`            | `constant.character.entity`, `punctuation.definition.entity`               |

### CSS

| Role            | Hex                        | Scope / Notes                                                  |
| --------------- | -------------------------- | -------------------------------------------------------------- |
| Selectors       | `#7A3E9D`                  | `meta.selector`, `meta.selector entity`, `entity.name.tag.css` |
| Property values | `#448C27`                  | `meta.property-value`, `support.constant.property-value`       |
| `!important`    | **bold** (no color change) | `keyword.other.important` — font style only                    |

### JSON

| Role      | Hex       | Scope / Notes                     |
| --------- | --------- | --------------------------------- |
| Key names | `#4B83CD` | `support.type.property-name.json` |

---

## Diff / Semantic Colors

Used for gutter indicators, overview ruler, and markup diff tokens.

| Role               | Hex       | Usage                                                           |
| ------------------ | --------- | --------------------------------------------------------------- |
| Inserted / Added   | `#A1DF8A` | `markup.inserted`, editor gutter added, overview ruler added    |
| Deleted / Removed  | `#EB5368` | `markup.deleted`, editor gutter deleted, overview ruler deleted |
| Changed / Modified | `#F0C36F` | `markup.changed`, editor gutter modified                        |
| Error              | `#D21D00` | `editorError`, overview ruler error, git deleted resource       |
| Warning            | `#DEB800` | `editorWarning`, `editorInfo`, overview ruler warning/info      |

---

## UI Accent Colors

Not syntax tokens, but important for consistent UI integration.

| Role                  | Hex                    | Usage                                                                                                             |
| --------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Primary accent (blue) | `#3D82C6`              | Buttons, badges, progress bar, active tab background, list active selection, ghost text, suggest widget highlight |
| Link / code lens      | `#0366D6`              | `editorLink.activeForeground`, `editorCodeLens.foreground`                                                        |
| Editor background     | `#FFFFFF`              |                                                                                                                   |
| Line highlight        | `#F0F5FA`              | `editor.lineHighlightBackground`                                                                                  |
| Selection             | `#ACD5FF`              | `editor.selectionBackground`                                                                                      |
| Selection highlight   | `#E9F4FF`              | `editor.selectionHighlightBackground`                                                                             |
| Find/hover highlight  | `#FFF78A` (~50% alpha) | `editor.findMatchBackground`, `editor.hoverHighlightBackground`                                                   |

---

## Font Style Rules

Only two token rules apply non-default font styles:

| Scope                                                                      | Style                        |
| -------------------------------------------------------------------------- | ---------------------------- |
| `entity.other.attribute-name.html`, `meta.tag entity.other.attribute-name` | **italic**                   |
| `markup.bold`, `punctuation.definition.bold`                               | **bold** (color `#795DA3`)   |
| `markup.italic`, `punctuation.definition.italic`                           | _italic_ (color `#A71D5D`)   |
| `keyword.other.important`                                                  | **bold** (no color override) |

---

## Hue / Saturation Summary

The palette draws from five distinct hue families:

| Family                | Hex(es)                                                          | Roles                                                            |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Crimson / Magenta** | `#A71D5D`                                                        | Keywords, storage, CSS selectors, italic markup                  |
| **Orange / Coral**    | `#ED6A43`, `#AB7967`, `#AB6526`                                  | Variables, interpolation, HTML entities                          |
| **Purple / Violet**   | `#795DA3`, `#7A3E9D`, `#173591`, `#183691`                       | Functions, constants, CSS selectors, punctuation, inline code    |
| **Blue**              | `#4180C6`, `#4B83CD`, `#91B3E0`, `#0086B3`, `#0366D6`, `#3D82C6` | Strings, JSON keys, HTML attrs, classes, integers, links, accent |
| **Teal / Green**      | `#63A3A4`, `#5C9966`, `#448C27`                                  | HTML tags, units, CSS property values                            |
| **Neutral**           | `#333333`, `#969896`                                             | Default text, comments                                           |

---

## Scope Priority Notes

A few scopes are intentionally overridden by more-specific rules:

- `variable.parameter.function` — defined twice: once under the generic "Text" rule (`#333`) and again under "Variable, Constant, Blocks" (`#ED6A43`). The more specific array entry wins, so parameter names render in **orange**.
- `entity.other.attribute-name` — gets `#795DA3` generically, but HTML-specific overrides in the HTML block change it to `#91B3E0` italic. HTML attribute names are **light blue italic**, not purple.
- `entity.name.tag` — appears in both the generic "Tag" rule and the "HTML: Tag Names" rule, both pointing to `#63A3A4`. Consistent.
- `meta.class` — explicitly set to `#333` (default), overriding any inherited class color. The class body itself is unstyled; only the class name declaration node gets the teal color.
- `punctuation.definition.entity` — claimed by both "Punctuation" (blue `#173591`) and "HTML: Entities" (brown `#AB6526`). The HTML-specific rule should win for HTML contexts.
