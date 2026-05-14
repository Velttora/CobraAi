# Backend Architecture

The API follows Screaming Architecture: top-level modules are named after
business capabilities, not technical layers.

Each domain module should use the same internal MVC shape:

- `controllers`: HTTP routes and webhook entry points.
- `services`: application use cases and orchestration.
- `models`: DTOs, view models, and persistence-facing types.
- `ports`: interfaces for external systems.
- `adapters`: implementations for providers such as Twilio, OpenAI, S3/R2, and Resend.

Controllers must stay thin. Business decisions belong in services, and external
providers must be reached through ports to keep dependency inversion explicit.
