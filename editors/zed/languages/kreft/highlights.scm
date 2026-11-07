(tag_name) @tag
(erroneous_end_tag_name) @tag.error
(doctype) @constant
(attribute_name) @attribute
(attribute_value) @string
(quoted_attribute_value) @string
(comment) @comment

; Kreft directives and bindings: k-if, k-for, @click, :value ...
((attribute_name) @keyword
  (#match? @keyword "^(k-|@|:)"))

; <view>, <script>, <style> blocks
((tag_name) @keyword
  (#match? @keyword "^(view|layout)$"))

"=" @punctuation.delimiter
[ "<" ">" "</" "/>" ] @punctuation.bracket
