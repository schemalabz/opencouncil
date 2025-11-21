// Database initialization
export const db = {
  meeting: {
    findMany: async (p0: { where: { cityId: string; }; skip: number; take: number; orderBy: { date: string; }; }) => [],
    count: async (p0: { where: { cityId: string; }; }) => 0,
  },
};
