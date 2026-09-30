package com.travelplan.common;

public record SessionUser(String id, String name, String email, String role, String csrf) {}
