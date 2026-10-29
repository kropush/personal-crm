// Dates are counted and shown in Moscow time wherever the server runs:
// the Docker images and Postgres work in UTC, a developer's computer in its
// own zone. A new day starts at midnight in Moscow.
export const APP_TIME_ZONE = "Europe/Moscow";
