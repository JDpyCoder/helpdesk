SELECT MIN("createdAt") AS oldest, MAX("createdAt") AS newest, MAX("createdAt") - MIN("createdAt") AS spread FROM ticket;
