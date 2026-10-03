// Errors caused by bad input; routes report these as 400s with the message.
class UserError extends Error {}

module.exports = { UserError };
