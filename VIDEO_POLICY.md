# Video Policy & Configuration

## Purpose
This document defines business requirements, legal compliance, and technical constraints for video support.

## Allowed Formats
- Containers: MP4, MOV, WebM, AVI, MKV, M4V
- Allowed extensions: mp4, mov, webm, avi, mkv, m4v
- Allowed codecs: h264, h265/hevc, vp8, vp9, av1
- Allowed MIME types: video/mp4, video/quicktime, video/webm, video/x-msvideo, video/x-matroska

## File Size Limits (Per Upload)
- Free tier: 2 GB
- Premium tier: 5 GB

## Duration Limits (Per Upload)
- Free tier: 5 minutes (300 seconds)
- Premium tier: 30 minutes (1800 seconds)

## User Quotas
- Free tier: 5 videos total
- Premium tier: 100 videos total
- Storage quota:
  - Free tier: 10 GB total
  - Premium tier: 100 GB total

## Retention & Lifecycle
- Retain videos for 2 years.
- Archive videos after 6 months of no views.
- Move original uploads to cold storage after 6 months.

## Content Moderation
- Manual review required before publishing.
- Automated flagging enabled for abusive content and copyright risk.

## PII Handling
- Faces and license plates should be detected and blurred before publishing.
- Additional PII review required for videos with minors or sensitive locations.

## Copyright & Licensing
- Uploaders must confirm ownership or valid license to publish the content.
- Default license: CC BY 4.0 unless otherwise specified.

## DMCA Takedown Process
- Provide a public reporting channel.
- Confirm receipt within 48 hours.
- Remove or disable access within 7 days of valid notice.
- Notify uploader and allow counter-notice per policy.

## Success Metrics
- Upload success rate target: >98%
- Time-to-play target: <3 seconds
- Cost per video target: <$0.50/month

## Legal Sign-Off
- Status: Pending
- Owner: Product Manager + Legal
- Date: TBD

## Audit Reference
- See `VIDEO_SUPPORT_CODEBASE_AUDIT.md` for implementation tracking.
