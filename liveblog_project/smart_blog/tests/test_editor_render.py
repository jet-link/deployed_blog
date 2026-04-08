"""Tests for Editor.js JSON → HTML rendering and inline sanitization."""
from django.test import SimpleTestCase

from smart_blog.editor.render import render_editorjs_to_html
from smart_blog.editor.sanitize import sanitize_editorjs_fragment


class EditorRenderTests(SimpleTestCase):
    def test_paragraph_strong_preserved(self):
        doc = {
            "blocks": [
                {"type": "paragraph", "data": {"text": "Hello <strong>world</strong>"}},
            ]
        }
        html = render_editorjs_to_html(doc)
        self.assertIn("<strong>world</strong>", html)

    def test_javascript_href_stripped(self):
        doc = {
            "blocks": [
                {
                    "type": "paragraph",
                    "data": {"text": '<a href="javascript:alert(1)">x</a>'},
                }
            ]
        }
        html = render_editorjs_to_html(doc)
        self.assertNotIn("javascript:", html)

    def test_data_uri_href_stripped(self):
        doc = {
            "blocks": [
                {
                    "type": "paragraph",
                    "data": {
                        "text": '<a href="data:text/html,&lt;img&gt;">x</a>',
                    },
                }
            ]
        }
        html = render_editorjs_to_html(doc)
        self.assertNotIn("data:", html.lower())

    def test_relative_link_kept(self):
        doc = {
            "blocks": [
                {"type": "paragraph", "data": {"text": '<a href="/path">x</a>'}},
            ]
        }
        html = render_editorjs_to_html(doc)
        self.assertIn('href="/path"', html)

    def test_list_item_inline_sanitized(self):
        doc = {
            "blocks": [
                {
                    "type": "list",
                    "data": {
                        "style": "unordered",
                        "items": ['<strong>one</strong>', "two"],
                    },
                }
            ]
        }
        html = render_editorjs_to_html(doc)
        self.assertIn("<strong>one</strong>", html)
        self.assertIn("two", html)

    def test_sanitize_empty(self):
        self.assertEqual(sanitize_editorjs_fragment(""), "")
        self.assertEqual(sanitize_editorjs_fragment(None), "")
