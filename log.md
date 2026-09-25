---
title: Design Log
---

# Design log

Dated entries from each team member — decisions made, work completed,
problems hit, and what's next. This is the page to check before a
supervisor meeting.

<div class="note">
  <strong>Adding an entry:</strong> copy <code>_log/TEMPLATE.md</code> to a
  new file named <code>_log/YYYY-MM-DD-short-title.md</code>, fill in the
  front matter and body, then commit and push. See README.md for the
  step-by-step.
</div>

<ul class="log-list">
{% assign entries = site.log | sort: 'date' | reverse %}
{% for entry in entries %}
  {% unless entry.path contains 'TEMPLATE' %}
  <li class="log-list__item">
    <span class="log-list__date mono">{{ entry.date | date: "%b %-d, %Y" }}</span>
    <div class="log-list__main">
      <a href="{{ entry.url | relative_url }}">{{ entry.title }}</a>
      <span class="log-list__author">{{ entry.author }}{% if entry.tags %} · {{ entry.tags | join: ", " }}{% endif %}</span>
    </div>
  </li>
  {% endunless %}
{% endfor %}
</ul>
