import { Tournament } from "@/models/Tournament";
import { ApiResponse } from "@/utils/server/ApiResponse";
import { asyncHandler } from "@/utils/server/asyncHandler";
import { requireAuth } from "@/utils/server/auth";

export const GET = asyncHandler(async (req) => {
  const user = await requireAuth(req);

  // Find tournaments where user is in staff array
  const tournaments = await Tournament.find({
    "staff.user": user._id,
  })
    .populate("games.game", "name icon")
    .populate("staff.user", "username email")
    .sort({ createdAt: -1 })
    .lean();

  // Add user's role for each tournament
  const tournamentsWithUserRole = tournaments.map((tournament) => {
    const staffMember = tournament.staff.find(
      (m) => m.user._id.toString() === user._id.toString()
    );
    return {
      ...tournament,
      userRole: staffMember?.role || null,
    };
  });

  return Response.json(
    new ApiResponse(
      200,
      tournamentsWithUserRole,
      "Your tournaments fetched successfully"
    )
  );
});
