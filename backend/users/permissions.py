''' 
Role-based access modifiers:
Each class defines who can access what in the app based on their role.

How to use:
In any views.py file, import the permission you need and add it to the
@permission_classes decorator above your view function.

Example (pretend this in datasheets/views.py or something):

# this goes at the top of the file
from users.permissions import isBCBA 

@api_view(["PUT"]) # this function would only respond to PUT requests
@permission_classes([isBCBA]) # permission decorator, this function 
                                will only run if the user has the BCBA role
def edit_datasheet(request, id):
    # actual code here
'''

from rest_framework.permissions import BasePermission

# allows access only to BCBAs
class isBCBA(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "bcba"

# allows access only to RBTs
class isRBT(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "rbt"

# allows access only to DSPs
class isDSP(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "dsp"

# allows access to BCBAs and RBTs but not DSPs
class isBCBAOrRBT(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ["bcba", "rbt"]

# allows access to any logged in user regardless of role
class isAnyRole(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated

# allows read only access to everyone, but only BCBAs can write
class isBCBAOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in ["GET", "HEAD", "OPTIONS"]:
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.role == "bcba"