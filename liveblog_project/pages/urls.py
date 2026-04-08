from django.urls import path
from smart_blog.views.editor_playground_views import editor_playground
from .views import PageView, FAQView
from . import views


app_name = 'pages'

urlpatterns = [
    path('', views.home_page, name='home'),
    path('faq/', FAQView.as_view(), name='faq'),
    path('sitemap/', views.sitemap_page, name='sitemap_page'),
    # Reserve /editor/ for Post Studio playground before CMS slug catches "editor"
    path('editor/', editor_playground, name='editor_playground'),
    path('<slug:slug>/', PageView.as_view(), name='page'),
    # path('dev/404/', views.custom_404_view),
    # path('dev/403/', views.custom_403_view),
]