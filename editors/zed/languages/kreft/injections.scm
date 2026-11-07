((script_element
  (raw_text) @injection.content)
  (#set! injection.language "javascript"))

((style_element
  (raw_text) @injection.content)
  (#set! injection.language "css"))

; Inline handlers and bindings are JavaScript expressions
((attribute
  (attribute_name) @_name
  (quoted_attribute_value (attribute_value) @injection.content))
  (#match? @_name "^(k-|@|:)")
  (#set! injection.language "javascript"))
